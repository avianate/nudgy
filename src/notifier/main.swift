// jot-notify <title> <subtitle> <body> <sound>
// Posts one banner as "Jot" and exits. Launched with no arguments (a click on a banner) it just exits.
import AppKit
import Foundation
import UserNotifications

let args = CommandLine.arguments
guard args.count == 5 else { exit(0) }

let center = UNUserNotificationCenter.current()
var status: Int32 = -1

func finish(_ code: Int32, _ message: String? = nil) {
  if let message { FileHandle.standardError.write(Data((message + "\n").utf8)) }
  status = code
}

center.requestAuthorization(options: [.alert, .sound]) { granted, error in
  guard granted else {
    finish(3, "not authorized: \(error?.localizedDescription ?? "notifications are off for Jot")")
    return
  }
  let content = UNMutableNotificationContent()
  content.title = args[1]
  content.subtitle = args[2]
  content.body = args[3]
  if !args[4].isEmpty { content.sound = UNNotificationSound(named: UNNotificationSoundName(args[4])) }
  let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
  center.add(request) { error in
    if let error { finish(4, "post failed: \(error.localizedDescription)") } else { finish(0) }
  }
}

let deadline = Date().addingTimeInterval(60)
while status == -1 && Date() < deadline {
  RunLoop.main.run(until: Date().addingTimeInterval(0.05))
}
if status == -1 { finish(5, "timed out waiting for Notification Center") }
exit(status)
