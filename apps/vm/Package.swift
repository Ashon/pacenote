// swift-tools-version: 6.2
// pacenote-vm: runs one process in a lightweight Linux VM (Apple's Containerization on
// Virtualization.framework), for the reasoner sandbox built into Pacenote. See README.md.
import PackageDescription

let package = Package(
    name: "pacenote-vm",
    platforms: [.macOS("15.0")],
    dependencies: [
        .package(url: "https://github.com/apple/containerization.git", exact: "0.49.0"),
        .package(url: "https://github.com/apple/swift-argument-parser.git", from: "1.7.0"),
    ],
    targets: [
        .executableTarget(
            name: "pacenote-vm",
            dependencies: [
                .product(name: "Containerization", package: "containerization"),
                .product(name: "ContainerizationOCI", package: "containerization"),
                .product(name: "ContainerizationExtras", package: "containerization"),
                .product(name: "ArgumentParser", package: "swift-argument-parser"),
            ]
        )
    ]
)
