import AppKit
import Foundation

final class Launcher: NSObject, NSApplicationDelegate {
    private let root = Bundle.main.bundleURL.deletingLastPathComponent()
    private let port = ProcessInfo.processInfo.environment["MOCK_TEST_PORT"] ?? "17654"
    private var server: Process?
    private var baseURL: URL { URL(string: "http://127.0.0.1:\(port)")! }

    func applicationDidFinishLaunching(_ notification: Notification) {
        checkServer { healthy in
            if healthy { self.openBrowser() } else { self.startServer() }
        }
    }

    private func checkServer(_ completion: @escaping (Bool) -> Void) {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/health"))
        request.timeoutInterval = 1
        URLSession.shared.dataTask(with: request) { data, _, _ in
            let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            DispatchQueue.main.async { completion(json?["app"] as? String == "mock-test") }
        }.resume()
    }

    private func startServer() {
        do {
            // Access from the native app first, so macOS can present its folder permission dialog.
            let script = root.appendingPathComponent("server.py")
            _ = try Data(contentsOf: script)
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
            process.arguments = [script.path]
            process.standardInput = FileHandle.nullDevice
            process.standardOutput = FileHandle.nullDevice
            process.standardError = FileHandle.nullDevice
            try process.run()
            server = process
            waitForServer(remaining: 40)
        } catch {
            fail("Cannot start the local server. Allow Mock Test to access its folder and try again.\n\n\(error.localizedDescription)")
        }
    }

    private func waitForServer(remaining: Int) {
        checkServer { healthy in
            if healthy { self.openBrowser(); return }
            guard remaining > 0, self.server?.isRunning == true else {
                self.fail("The local server could not start. Check folder access or whether another application is using port \(self.port).")
                return
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                self.waitForServer(remaining: remaining - 1)
            }
        }
    }

    private func openBrowser() {
        let workspace = NSWorkspace.shared
        if let chrome = workspace.urlForApplication(withBundleIdentifier: "com.google.Chrome") {
            let configuration = NSWorkspace.OpenConfiguration()
            configuration.activates = true
            workspace.open([baseURL], withApplicationAt: chrome, configuration: configuration) { _, error in
                DispatchQueue.main.async {
                    if let error = error { self.fail(error.localizedDescription) }
                    else { NSApp.terminate(nil) }
                }
            }
        } else if workspace.open(baseURL) {
            NSApp.terminate(nil)
        } else {
            fail("Could not open a browser. Open \(baseURL.absoluteString) manually.")
        }
    }

    private func fail(_ message: String) {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Mock Test could not open"
        alert.informativeText = message
        alert.runModal()
        NSApp.terminate(nil)
    }
}

let app = NSApplication.shared
let launcher = Launcher()
app.setActivationPolicy(.accessory)
app.delegate = launcher
app.run()
