import ArgumentParser
import Containerization
import ContainerizationOCI
import Foundation
import SystemPackage

/// Where sockets relayed into the guest appear, on a tmpfs of its own, since
/// the root filesystem is read-only. The image's entrypoint forwards
/// 127.0.0.1:3128 to the egress socket, and 127.0.0.1:8080 to the broker's.
let guestRelayDirectory = "/run/pacenote"
let guestEgressSocket = "\(guestRelayDirectory)/egress.sock"

/// What a run gets besides its command: shares, tmpfs, environment, user, size
/// and the way out
struct RunOptions: ParsableArguments {
    @Option(help: "pacenote-vm's folder") var root: String

    @Option(
        name: .customLong("mount"),
        help: "A host folder in the guest, read-only unless :rw (HOST:GUEST[:rw]). Repeatable."
    )
    var mounts: [String] = []

    @Option(
        name: .customLong("tmpfs"),
        help: "An empty tmpfs (GUEST[:OPTIONS], options as for mount -o). Repeatable."
    )
    var tmpfs: [String] = []

    @Option(
        name: .customLong("env"),
        help: "NAME=VALUE, or NAME for the value in pacenote-vm's own environment. Repeatable."
    )
    var env: [String] = []

    @Option(help: "The working directory in the guest") var workdir: String?
    @Option(help: "UID[:GID] to run as") var user: String?
    @Option(help: "Virtual CPUs") var cpus: Int = 2
    @Option(help: "Memory for the process, in MiB") var memory: UInt64 = 2048

    @Option(help: "A unix socket on the host to relay into the guest as \(guestEgressSocket)")
    var egress: String?

    @Option(
        name: .customLong("relay"),
        help: "A unix socket on the host to relay into the guest (HOST:NAME, appearing as \(guestRelayDirectory)/NAME). Repeatable."
    )
    var relays: [String] = []

    @Option(
        name: .customLong("publish"),
        help: "A unix socket a process in the guest listens on, relayed out to the host (GUEST:HOST). Repeatable."
    )
    var publishes: [String] = []

    /// Sockets relayed in: the egress socket and the others, by guest path
    var relaysIn: [(host: String, guest: String)] {
        (egress.map { [($0, guestEgressSocket)] } ?? [])
            + relays.map { relay in
                let parts = relay.split(separator: ":", maxSplits: 1).map(String.init)
                return (parts[0], "\(guestRelayDirectory)/\(parts[1])")
            }
    }

    func validate() throws {
        for mount in mounts {
            let parts = mount.split(separator: ":", omittingEmptySubsequences: false)
            guard parts.count == 2 || (parts.count == 3 && parts[2] == "rw") else {
                throw ValidationError("--mount takes HOST:GUEST or HOST:GUEST:rw, not \(mount)")
            }
        }
        if let user { _ = try parseUser(user) }
        for relay in relays {
            let parts = relay.split(separator: ":", maxSplits: 1)
            guard parts.count == 2, !parts[1].contains("/") else {
                throw ValidationError("--relay takes HOST:NAME, not \(relay)")
            }
        }
        for publish in publishes {
            guard publish.split(separator: ":").count == 2, publish.hasPrefix("/") else {
                throw ValidationError("--publish takes GUEST:HOST, not \(publish)")
            }
        }
    }

    /// The mounts for the container: the defaults, the shares, the tmpfs, and
    /// a tmpfs for the egress socket. A single file is copied into a folder of
    /// this run's first: virtiofs shares whole folders, and the file's own
    /// folder may hold more than the run should see (~/.codex, say).
    func containerMounts(runDirectory: URL) throws -> [Containerization.Mount] {
        var out = LinuxContainer.defaultMounts()
        let fm = FileManager.default
        for (index, mount) in mounts.enumerated() {
            let parts = mount.split(separator: ":", omittingEmptySubsequences: false).map(String.init)
            var source = parts[0]
            var isDirectory: ObjCBool = false
            guard fm.fileExists(atPath: source, isDirectory: &isDirectory) else {
                throw ValidationError("--mount: \(source) does not exist")
            }
            if !isDirectory.boolValue {
                let holder = runDirectory.appendingPathComponent("files/\(index)")
                try fm.createDirectory(at: holder, withIntermediateDirectories: true)
                let copy = holder.appendingPathComponent(URL(fileURLWithPath: source).lastPathComponent)
                try fm.copyItem(atPath: source, toPath: copy.path)
                source = copy.path
            }
            out.append(.share(source: source, destination: parts[1], options: parts.count == 3 ? [] : ["ro"]))
        }
        for entry in tmpfs {
            let parts = entry.split(separator: ":", maxSplits: 1).map(String.init)
            let options = parts.count == 2 ? parts[1].split(separator: ",").map(String.init) : []
            out.append(
                .any(type: "tmpfs", source: "tmpfs", destination: parts[0], options: ["nosuid", "nodev"] + options))
        }
        if !relaysIn.isEmpty {
            out.append(
                .any(
                    type: "tmpfs", source: "tmpfs", destination: guestRelayDirectory,
                    options: ["nosuid", "nodev", "noexec", "mode=0755", "size=1m"]))
        }
        return out
    }

    /// NAME=VALUE pairs, taking a bare NAME's value from this process
    func environment() throws -> [String] {
        try env.map { entry in
            if entry.contains("=") { return entry }
            guard let value = ProcessInfo.processInfo.environment[entry] else {
                throw ValidationError("--env \(entry) is not set in pacenote-vm's environment")
            }
            return "\(entry)=\(value)"
        }
    }
}

func parseUser(_ text: String) throws -> ContainerizationOCI.User {
    let parts = text.split(separator: ":").map { UInt32($0) }
    guard (1...2).contains(parts.count), let uid = parts[0], parts.count == 1 || parts[1] != nil else {
        throw ValidationError("--user takes UID[:GID] as numbers, not \(text)")
    }
    return ContainerizationOCI.User(uid: uid, gid: parts.count == 2 ? parts[1]! : uid)
}

/// The process to run, as it will see itself
struct Workload {
    var arguments: [String]
    var environment: [String]
    var workingDirectory: String
    var user: ContainerizationOCI.User
}

/// Runs the workload in a VM of its own, with this process's stdin, stdout and
/// stderr, and returns its exit code. SIGTERM and SIGINT stop it: the process
/// gets SIGTERM, and the VM stops after a grace period whatever it does.
func runInVM(
    root: Root,
    rootfs: Containerization.Mount,
    workload: Workload,
    options: RunOptions,
    runDirectory: URL
) async throws -> Int32 {
    let vmm = try root.vmm(runDirectory: runDirectory)
    let id = "pv-\(UUID().uuidString.prefix(8).lowercased())"
    var config = LinuxContainer.Configuration()
    config.process.arguments = workload.arguments
    config.process.environmentVariables = workload.environment
    config.process.workingDirectory = workload.workingDirectory
    config.process.user = workload.user
    config.process.stdin = StandardInput()
    config.process.stdout = StandardWriter(FileHandle.standardOutput)
    config.process.stderr = StandardWriter(FileHandle.standardError)
    config.cpus = options.cpus
    config.memoryInBytes = options.memory.mib()
    config.mounts = try options.containerMounts(runDirectory: runDirectory)
    config.useInit = true
    config.bootLog = .file(path: runDirectory.appendingPathComponent("boot.log"))
    config.sockets =
        options.relaysIn.map { relay in
            UnixSocketConfiguration(
                source: URL(fileURLWithPath: relay.host),
                destination: URL(fileURLWithPath: relay.guest),
                permissions: FilePermissions(rawValue: 0o777),
                direction: .into
            )
        }
        + options.publishes.map { publish in
            let parts = publish.split(separator: ":").map(String.init)
            // Only this account reaches it on the host.
            return UnixSocketConfiguration(
                source: URL(fileURLWithPath: parts[0]),
                destination: URL(fileURLWithPath: parts[1]),
                permissions: FilePermissions(rawValue: 0o600),
                direction: .outOf
            )
        }
    let container = try LinuxContainer(
        id,
        rootfs: rootfs,
        vmm: vmm,
        vm: VMResources(
            cpus: options.cpus,
            memoryInBytes: options.memory.mib() + VMResources.guestMemoryOverhead),
        configuration: config
    )

    let stopping = Stopping(container)
    let signals = [SIGTERM, SIGINT].map { number in
        signal(number, SIG_IGN)
        let source = DispatchSource.makeSignalSource(signal: number)
        source.setEventHandler { stopping.stop() }
        source.resume()
        return source
    }
    defer { signals.forEach { $0.cancel() } }

    try await container.create()
    do {
        try await container.start()
        let status = try await container.wait()
        try? await container.stop()
        return stopping.requested ? 128 + SIGTERM : status.exitCode
    } catch {
        try? await container.stop()
        if stopping.requested { return 128 + SIGTERM }
        throw error
    }
}

/// Stops a container once, on a signal
final class Stopping: @unchecked Sendable {
    private let container: LinuxContainer
    private let lock = NSLock()
    private var asked = false

    init(_ container: LinuxContainer) {
        self.container = container
    }

    var requested: Bool {
        lock.withLock { asked }
    }

    func stop() {
        let first = lock.withLock {
            defer { asked = true }
            return !asked
        }
        guard first else { return }
        let container = self.container
        Task {
            try? await container.kill(Signal(rawValue: 15))  // SIGTERM in the guest
            try? await Task.sleep(for: .seconds(3))
            try? await container.stop()
        }
    }
}

/// This process's stdin, read as it comes
final class StandardInput: ReaderStream {
    func stream() -> AsyncStream<Data> {
        AsyncStream { continuation in
            Thread.detachNewThread {
                while true {
                    let data = FileHandle.standardInput.availableData
                    if data.isEmpty {
                        continuation.finish()
                        return
                    }
                    continuation.yield(data)
                }
            }
        }
    }
}

final class StandardWriter: Writer, @unchecked Sendable {
    private let handle: FileHandle

    init(_ handle: FileHandle) {
        self.handle = handle
    }

    func write(_ data: Data) throws {
        guard !data.isEmpty else { return }
        try handle.write(contentsOf: data)
    }

    func close() throws {}
}
