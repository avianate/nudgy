// Renders the Nudgy Notifier app icon as an asset catalog for actool: xcrun swift scripts/icon.swift <Assets.xcassets>
import AppKit

let catalog = CommandLine.arguments[1]
let out = "\(catalog)/AppIcon.appiconset"
try! FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)

func render(_ px: Int) -> Data {
  let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8, samplesPerPixel: 4,
    hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  let s = CGFloat(px) / 1024

  // macOS icon grid: an 824pt body inset 100pt, corner radius ~185pt
  let body = NSRect(x: 100 * s, y: 100 * s, width: 824 * s, height: 824 * s)
  let shape = NSBezierPath(roundedRect: body, xRadius: 185 * s, yRadius: 185 * s)
  NSGradient(
    starting: NSColor(srgbRed: 0.48, green: 0.55, blue: 0.97, alpha: 1),
    ending: NSColor(srgbRed: 0.33, green: 0.27, blue: 0.80, alpha: 1))!
    .draw(in: shape, angle: -90)

  let font = NSFont.systemFont(ofSize: 600 * s, weight: .heavy)
  let rounded = font.fontDescriptor.withDesign(.rounded).flatMap { NSFont(descriptor: $0, size: 600 * s) } ?? font
  let glyph = NSAttributedString(string: "n", attributes: [.font: rounded, .foregroundColor: NSColor.white])
  let size = glyph.size()
  glyph.draw(at: NSPoint(x: (1024 * s - size.width) / 2 + 6 * s, y: (1024 * s - size.height) / 2 + 20 * s))

  let dot = NSRect(x: 650 * s, y: 650 * s, width: 190 * s, height: 190 * s)
  NSColor(srgbRed: 0.99, green: 0.72, blue: 0.25, alpha: 1).setFill()
  NSBezierPath(ovalIn: dot).fill()
  NSColor.white.setStroke()
  let ring = NSBezierPath(ovalIn: dot)
  ring.lineWidth = 22 * s
  ring.stroke()

  NSGraphicsContext.restoreGraphicsState()
  return rep.representation(using: .png, properties: [:])!
}

var images: [[String: String]] = []
for (points, scale) in [(16, 1), (16, 2), (32, 1), (32, 2), (128, 1), (128, 2), (256, 1), (256, 2), (512, 1), (512, 2)] {
  let name = scale == 1 ? "icon_\(points)x\(points).png" : "icon_\(points)x\(points)@2x.png"
  try! render(points * scale).write(to: URL(fileURLWithPath: "\(out)/\(name)"))
  images.append(["idiom": "mac", "size": "\(points)x\(points)", "scale": "\(scale)x", "filename": name])
}
let info = ["version": 1, "author": "xcode"] as [String: Any]
let json = { (object: Any, path: String) in
  try! JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys])
    .write(to: URL(fileURLWithPath: path))
}
json(["images": images, "info": info], "\(out)/Contents.json")
json(["info": info], "\(catalog)/Contents.json")
