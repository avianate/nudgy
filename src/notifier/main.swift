// jot-notify --json '<payload>'   post one alert; a payload with "item" gets Done / Snooze / Remind later actions
// jot-notify --list               print delivered notifications (identifier<TAB>title)
// jot-notify                      how macOS relaunches us when an action is clicked: run jot, then exit
import AppKit
import Foundation
import UserNotifications

let center = UNUserNotificationCenter.current()
let args = CommandLine.arguments
let reminderCategory = "jot-reminder"

func warn(_ message: String) {
  FileHandle.standardError.write(Data((message + "\n").utf8))
}

func spin(until done: () -> Bool, timeout: TimeInterval) {
  let deadline = Date().addingTimeInterval(timeout)
  while !done() && Date() < deadline {
    RunLoop.main.run(until: Date().addingTimeInterval(0.05))
  }
}

func registerActions(snooze: String) {
  let done = UNNotificationAction(identifier: "done", title: "Done", options: [])
  let snoozeAction = UNNotificationAction(
    identifier: "snooze", title: snooze.isEmpty ? "Snooze" : "Snooze \(snooze)", options: [])
  let later = UNTextInputNotificationAction(
    identifier: "later", title: "Remind later…", options: [],
    textInputButtonTitle: "Remind", textInputPlaceholder: "in 2h, tomorrow 9am, every weekday 9am")
  center.setNotificationCategories([
    UNNotificationCategory(
      identifier: reminderCategory, actions: [done, snoozeAction, later], intentIdentifiers: [], options: [])
  ])
}

func post(title: String, subtitle: String, body: String, sound: String, id: String, item: [String: Any]?)
  -> Int32
{
  var status: Int32 = -1
  center.requestAuthorization(options: [.alert, .sound]) { granted, error in
    guard granted else {
      warn("not authorized: \(error?.localizedDescription ?? "notifications are off for Jot")")
      status = 3
      return
    }
    let content = UNMutableNotificationContent()
    content.title = title
    content.subtitle = subtitle
    content.body = body
    if !sound.isEmpty { content.sound = UNNotificationSound(named: UNNotificationSoundName(sound)) }
    if let item {
      registerActions(snooze: item["snooze"] as? String ?? "")
      content.categoryIdentifier = reminderCategory
      content.userInfo = ["item": item]
    }
    // Same identifier = same reminder: Notification Center keeps one entry per reminder. Persistent alerts already
    // on screen still stay until dismissed; macOS does not retract them, with or without removeDelivered.
    center.add(UNNotificationRequest(identifier: id, content: content, trigger: nil)) { error in
      if let error { warn("post failed: \(error.localizedDescription)") }
      status = error == nil ? 0 : 4
    }
  }
  spin(until: { status != -1 }, timeout: 60)
  if status == -1 { warn("timed out waiting for Notification Center") }
  return status == -1 ? 5 : status
}

// Returns stderr on failure, nil on success
func runJot(_ bin: String, home: String, _ arguments: [String]) -> String? {
  let process = Process()
  process.executableURL = URL(fileURLWithPath: bin)
  process.arguments = arguments
  var env = ProcessInfo.processInfo.environment
  env["JOT_HOME"] = home
  process.environment = env
  let errors = Pipe()
  process.standardError = errors
  process.standardOutput = FileHandle.nullDevice
  do { try process.run() } catch { return "could not run \(bin): \(error.localizedDescription)" }
  process.waitUntilExit()
  if process.terminationStatus == 0 { return nil }
  let text = String(data: errors.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
  return text.trimmingCharacters(in: .whitespacesAndNewlines)
}

// Clicked actions run with no terminal and no daemon, so they leave a trail next to daemon.log
func log(_ home: String, _ message: String) {
  let line = "\(ISO8601DateFormatter().string(from: Date())) \(message)\n"
  let path = "\(home)/notifier.log"
  if let handle = FileHandle(forWritingAtPath: path) {
    handle.seekToEndOfFile()
    handle.write(Data(line.utf8))
    handle.closeFile()
  } else {
    FileManager.default.createFile(atPath: path, contents: Data(line.utf8))
  }
}

final class Responder: NSObject, UNUserNotificationCenterDelegate {
  func userNotificationCenter(
    _ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    handle(response)
    completionHandler()
    DispatchQueue.main.async { NSApp.terminate(nil) }
  }

  private func handle(_ response: UNNotificationResponse) {
    guard let item = response.notification.request.content.userInfo["item"] as? [String: Any],
      let id = (item["id"] as? NSNumber)?.intValue,
      let bin = item["jotBin"] as? String, let home = item["jotHome"] as? String
    else {
      log(NSHomeDirectory() + "/.jot", "action \(response.actionIdentifier) with no item in userInfo")
      return
    }
    let typed = (response as? UNTextInputNotificationResponse)?.userText
    log(home, "action \(response.actionIdentifier) on #\(id)\(typed.map { " text=\"\($0)\"" } ?? "")")
    let command: [String]
    switch response.actionIdentifier {
    case "done": command = ["done", String(id)]
    // A plain click on the alert snoozes too; closing it with ✕ delivers nothing, so it only waits for the re-alert
    case "snooze", UNNotificationDefaultActionIdentifier: command = ["snooze", String(id)]
    case "later":
      let text = (response as? UNTextInputNotificationResponse)?.userText.trimmingCharacters(in: .whitespaces) ?? ""
      if text.isEmpty { return }
      command = ["remind", String(id), text]
    default: return
    }
    let failure = runJot(bin, home: home, command)
    log(home, "jot \(command.joined(separator: " ")) → \(failure.map { "failed: \($0)" } ?? "ok")")
    if let failure {
      _ = post(
        title: "jot: couldn't update #\(id)", subtitle: "", body: failure.replacingOccurrences(of: "jot: ", with: ""),
        sound: "", id: "jot-error-\(id)", item: nil)
    }
  }
}

if args.count == 2 && args[1] == "--list" {
  var done = false
  center.getDeliveredNotifications { delivered in
    for n in delivered { print("\(n.request.identifier)\t\(n.request.content.title)") }
    done = true
  }
  spin(until: { done }, timeout: 10)
  exit(0)
}

if args.count == 3 && args[1] == "--json" {
  guard let data = args[2].data(using: .utf8),
    let payload = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
    let title = payload["title"] as? String, let id = payload["id"] as? String
  else {
    warn("expected --json '{\"title\":…,\"id\":…}'")
    exit(64)
  }
  exit(
    post(
      title: title, subtitle: payload["subtitle"] as? String ?? "", body: payload["body"] as? String ?? "",
      sound: payload["sound"] as? String ?? "", id: id, item: payload["item"] as? [String: Any]))
}

// Launched by macOS for a clicked action. The delegate must be in place before the app finishes launching.
let responder = Responder()
center.delegate = responder
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
DispatchQueue.main.asyncAfter(deadline: .now() + 20) { NSApp.terminate(nil) }
app.run()
