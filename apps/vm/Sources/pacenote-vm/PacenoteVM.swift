// pacenote-vm: Pacenote's built-in reasoner sandbox. Each run is one process in a
// lightweight Linux VM of its own (Apple's Containerization on
// Virtualization.framework), with no network device: the only way out is the
// egress socket the host relays in, which Pacenote's allowlist proxy serves.
//
//   pacenote-vm prepare --root R              the init filesystem (vminitd)
//   pacenote-vm build --root R --base REF --name N [--label K=V] [run options] -- SCRIPT ARGS...
//   pacenote-vm run --root R --image N [run options] -- COMMAND ARGS...
//   pacenote-vm status --root R               what is ready, as JSON
//
// R holds everything: kernel/vmlinux (put there by Pacenote), initfs.ext4,
// store/ (OCI content), images/<name>/{rootfs.ext4,config.json}, and runs/<id>/
// while a run lasts.
import ArgumentParser
import Containerization
import ContainerizationOCI
import Foundation

@main
struct PacenoteVM: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "pacenote-vm",
        abstract: "Runs processes in lightweight Linux VMs for Pacenote's reasoner sandbox.",
        subcommands: [Prepare.self, Build.self, Run.self, Status.self]
    )
}

/// The init image vminitd comes in, matching the Containerization version
let initReference = "ghcr.io/apple/containerization/vminit:0.49.0"

/// The version of what pacenote-vm takes and says; Pacenote checks it
let formatVersion = 1

/// Where pacenote-vm keeps its files
struct Root {
    let url: URL

    init(_ path: String) {
        url = URL(fileURLWithPath: path, isDirectory: true)
    }

    var kernel: URL { url.appendingPathComponent("kernel/vmlinux") }
    var initfs: URL { url.appendingPathComponent("initfs.ext4") }
    var store: URL { url.appendingPathComponent("store") }
    var images: URL { url.appendingPathComponent("images") }
    var runs: URL { url.appendingPathComponent("runs") }

    func image(_ name: String) -> URL { images.appendingPathComponent(name) }

    /// The VM manager for one run: the kernel, and its own clone of the init
    /// filesystem prepare left (a VM holds its disk images to itself)
    func vmm(runDirectory: URL) throws -> VZVirtualMachineManager {
        for (file, what) in [(kernel, "kernel"), (initfs, "init filesystem")] {
            guard FileManager.default.fileExists(atPath: file.path) else {
                throw ValidationError("The \(what) is missing (\(file.path)): prepare first.")
            }
        }
        let initfs = try cloneFile(self.initfs, into: runDirectory)
        return VZVirtualMachineManager(
            kernel: Kernel(path: kernel, platform: .linuxArm),
            initialFilesystem: .block(format: "ext4", source: initfs.path, destination: "/", options: ["ro"])
        )
    }
}

/// How a built image runs: what its base said, with the build's changes
struct ImageConfig: Codable {
    var base: String
    var user: String
    var workingDirectory: String
    var environment: [String]
    var entrypoint: [String]
    var created: String
    /// What the build was told to keep with the image (build --label)
    var labels: [String: String]?
}

/// Writes one line of JSON to stdout, for Pacenote to read
func emit(_ value: some Encodable) throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    FileHandle.standardOutput.write(try encoder.encode(value))
    FileHandle.standardOutput.write(Data("\n".utf8))
}

extension PacenoteVM {
    struct Prepare: AsyncParsableCommand {
        static let configuration = CommandConfiguration(
            abstract: "Fetches vminitd and makes the init filesystem. The kernel is put in place by Pacenote."
        )

        @Option(help: "pacenote-vm's folder") var root: String

        func run() async throws {
            let root = Root(root)
            let store = try ImageStore(path: root.store)
            let image = try await store.getInitImage(reference: initReference)
            try? FileManager.default.removeItem(at: root.initfs)
            _ = try await image.initBlock(at: root.initfs, for: .linuxArm)
            try emit(["initfs": root.initfs.path])
        }
    }

    struct Status: AsyncParsableCommand {
        static let configuration = CommandConfiguration(abstract: "Says what is ready, as JSON.")

        @Option(help: "pacenote-vm's folder") var root: String

        struct Report: Encodable {
            var version: Int
            var kernel: Bool
            var initfs: Bool
            var images: [String: ImageConfig]
        }

        func run() async throws {
            let root = Root(root)
            let fm = FileManager.default
            var images: [String: ImageConfig] = [:]
            for name in (try? fm.contentsOfDirectory(atPath: root.images.path)) ?? [] {
                let dir = root.image(name)
                guard fm.fileExists(atPath: dir.appendingPathComponent("rootfs.ext4").path),
                    let data = fm.contents(atPath: dir.appendingPathComponent("config.json").path),
                    let config = try? JSONDecoder().decode(ImageConfig.self, from: data)
                else { continue }
                images[name] = config
            }
            try emit(
                Report(
                    version: formatVersion,
                    kernel: fm.fileExists(atPath: root.kernel.path),
                    initfs: fm.fileExists(atPath: root.initfs.path),
                    images: images
                ))
        }
    }
}

/// A copy of the file in the folder, made as an APFS clone where it can be:
/// instant, and taking no room until one of them changes
func cloneFile(_ file: URL, into directory: URL) throws -> URL {
    let copy = directory.appendingPathComponent(file.lastPathComponent)
    if clonefile(file.path, copy.path, 0) != 0 {
        try FileManager.default.copyItem(at: file, to: copy)
    }
    return copy
}
