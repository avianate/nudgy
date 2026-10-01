// Renders assets/icon.png into the Nudgy Notifier asset catalog for actool: xcrun swift scripts/icon.swift <Assets.xcassets>
import AppKit

let catalog = CommandLine.arguments[1]
let out = "\(catalog)/AppIcon.appiconset"
try! FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)

let source = NSImage(contentsOfFile: "assets/icon.png")!
let side = CGFloat(source.representations[0].pixelsWide)
// The artwork's rounded square, in source pixels from the top left, measured from its alpha. Its bottom
// edge carries a few pixels of 3D rim and shadow, so the square is taken from the top, left and right
let art = (x: CGFloat(154), y: CGFloat(158), side: CGFloat(944))

// macOS only shows an icon full size when its outline is the system's: an 824pt rounded square inset
// 100pt with a ~185pt radius. Anything else is shrunk onto a grey platter. So the artwork is clipped
// to that outline, scaled 4% past it so its own rim and shadow fall outside the clip
func render(_ px: Int) -> Data {
  let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8, samplesPerPixel: 4,
    hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  NSGraphicsContext.current!.imageInterpolation = .high
  let s = CGFloat(px) / 1024
  NSBezierPath(roundedRect: NSRect(x: 100 * s, y: 100 * s, width: 824 * s, height: 824 * s), xRadius: 185 * s, yRadius: 185 * s)
    .addClip()
  let k = 824 * 1.04 * s / art.side
  // Centre the artwork's square on the canvas; AppKit's y axis points up
  let mid = (x: art.x + art.side / 2, y: side - (art.y + art.side / 2))
  source.draw(
    in: NSRect(x: 512 * s - mid.x * k, y: 512 * s - mid.y * k, width: side * k, height: side * k),
    from: .zero, operation: .sourceOver, fraction: 1)
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
