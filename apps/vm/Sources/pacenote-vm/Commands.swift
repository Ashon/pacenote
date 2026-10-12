import ArgumentParser
import Containerization
import ContainerizationOCI
import Foundation

extension PacenoteVM {
    struct Run: AsyncParsableCommand {
        static let configuration = CommandConfiguration(
            abstract: "Runs a command in a VM of its own, on a built image, read-only.",
            discussion: "Exits with the command's exit code; stdin, stdout and stderr are the command's."
        )

        @Option(help: "A built image's name") var image: String
        @OptionGroup var options: RunOptions
        @Argument(parsing: .captureForPassthrough, help: "The command and its arguments")
        var command: [String] = []

        func run() async throws {
            let root = Root(options.root)
            let dir = root.image(image)
            let configData: Data
            do {
                configData = try Data(contentsOf: dir.appendingPathComponent("config.json"))
            } catch {
                throw ValidationError("No image \(image) in \(root.images.path): build it first.")
            }
            let config = try JSONDecoder().decode(ImageConfig.self, from: configData)
            let arguments = config.entrypoint + command.drop { $0 == "--" }
            guard !arguments.isEmpty else { throw ValidationError("Nothing to run.") }

            let runDirectory = try makeRunDirectory(root)
            defer { try? FileManager.default.removeItem(at: runDirectory) }
            // A clone of its own: runs at the same time cannot share one disk image.
            let rootfs = try cloneFile(dir.appendingPathComponent("rootfs.ext4"), into: runDirectory)
            let code = try await runInVM(
                root: root,
                rootfs: .block(format: "ext4", source: rootfs.path, destination: "/", options: ["ro"]),
                workload: Workload(
                    arguments: arguments,
                    environment: config.environment + (try options.environment()),
                    workingDirectory: options.workdir ?? config.workingDirectory,
                    user: try parseUser(options.user ?? config.user)
                ),
                options: options,
                runDirectory: runDirectory
            )
            throw ExitCode(code)
        }
    }

    struct Build: AsyncParsableCommand {
        static let configuration = CommandConfiguration(
            abstract: "Builds an image: a base image's files, changed by a command run as root in a VM.",
            discussion: """
                The command runs on a writable copy of the base image. When it exits 0, \
                that copy becomes the image NAME, which runs read-only from then on.
                """
        )

        @Option(help: "The base image to pull, such as docker.io/library/node:24-bookworm-slim")
        var base: String
        @Option(help: "The name to give the image") var name: String
        @Option(help: "The image's user from now on (UID[:GID])") var setUser: String?
        @Option(help: "The image's working directory from now on") var setWorkdir: String?
        @Option(help: "NAME=VALUE in the image's environment from now on. Repeatable.")
        var setEnv: [String] = []
        @Option(help: "The image's entrypoint from now on (a path in the image)")
        var setEntrypoint: String?
        @Option(help: "The image's size in GiB") var size: UInt64 = 6
        @OptionGroup var options: RunOptions
        @Argument(parsing: .captureForPassthrough, help: "The command that changes the image")
        var command: [String] = []

        func run() async throws {
            let root = Root(options.root)
            let arguments = Array(command.drop { $0 == "--" })
            guard !arguments.isEmpty else { throw ValidationError("Nothing to run.") }
            if let setUser { _ = try parseUser(setUser) }

            let store = try ImageStore(path: root.store)
            let image = try await store.get(reference: base, pull: true)
            let baseConfig = try await image.config(for: .current).config
            let baseEnvironment = baseConfig?.env ?? ["PATH=\(LinuxProcessConfiguration.defaultPath)"]

            let runDirectory = try makeRunDirectory(root)
            defer { try? FileManager.default.removeItem(at: runDirectory) }
            let rootfsFile = runDirectory.appendingPathComponent("rootfs.ext4")
            let rootfs = try await EXT4Unpacker(capacityInBytes: size.gib())
                .unpack(image, for: .current, at: rootfsFile)

            let code = try await runInVM(
                root: root,
                rootfs: rootfs,
                workload: Workload(
                    arguments: arguments,
                    environment: baseEnvironment + (try options.environment()),
                    workingDirectory: options.workdir ?? "/",
                    user: try parseUser(options.user ?? "0")
                ),
                options: options,
                runDirectory: runDirectory
            )
            guard code == 0 else {
                FileHandle.standardError.write(Data("The build exited with \(code); \(name) is unchanged.\n".utf8))
                throw ExitCode(code)
            }

            let config = ImageConfig(
                base: base,
                user: setUser ?? baseConfig?.user ?? "0",
                workingDirectory: setWorkdir ?? baseConfig?.workingDir ?? "/",
                environment: mergeEnvironment(baseEnvironment, setEnv),
                entrypoint: setEntrypoint.map { [$0] } ?? baseConfig?.entrypoint ?? [],
                created: ISO8601DateFormatter().string(from: Date())
            )
            // The new image replaces the old one at once: runs started before
            // keep the old files open.
            let fm = FileManager.default
            try fm.createDirectory(at: root.images, withIntermediateDirectories: true)
            let staging = root.images.appendingPathComponent(".\(name).\(UUID().uuidString.prefix(8))")
            try fm.createDirectory(at: staging, withIntermediateDirectories: true)
            try fm.moveItem(at: rootfsFile, to: staging.appendingPathComponent("rootfs.ext4"))
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            try encoder.encode(config).write(to: staging.appendingPathComponent("config.json"))
            let target = root.image(name)
            if fm.fileExists(atPath: target.path) {
                _ = try fm.replaceItemAt(target, withItemAt: staging)
            } else {
                try fm.moveItem(at: staging, to: target)
            }
            try emit(["image": name])
        }
    }
}

/// The base environment with NAME=VALUE entries set over it
func mergeEnvironment(_ base: [String], _ changes: [String]) -> [String] {
    var out = base
    for change in changes {
        let name = change.split(separator: "=", maxSplits: 1).first.map(String.init) ?? change
        out.removeAll { $0.hasPrefix("\(name)=") }
        out.append(change)
    }
    return out
}

/// A folder for one run's files (its boot log, a build's root filesystem)
func makeRunDirectory(_ root: Root) throws -> URL {
    let dir = root.runs.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
}
