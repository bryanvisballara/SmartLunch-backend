import AVFoundation
import AppKit

let args = CommandLine.arguments
let videoPath = args.count > 1
  ? args[1]
  : "public/landing/hero-scroll-section4.mp4"
let outPath = args.count > 2
  ? args[2]
  : "public/landing/frame-pagos-en-linea.png"

let url = URL(fileURLWithPath: videoPath)
let asset = AVAsset(url: url)
let duration = CMTimeGetSeconds(asset.duration)
let timeSec = args.count > 3 ? (Double(args[3]) ?? -1) : -1
let time = timeSec >= 0
  ? CMTime(seconds: min(max(0, timeSec), max(0, duration - 0.001)), preferredTimescale: 600)
  : CMTime(seconds: max(0, duration - 0.04), preferredTimescale: 600)
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.maximumSize = CGSize(width: 1024, height: 576)

do {
  let cgImage = try generator.copyCGImage(at: time, actualTime: nil)
  let rep = NSBitmapImageRep(cgImage: cgImage)
  guard let data = rep.representation(using: .png, properties: [:]) else {
    fputs("Failed PNG encode\n", stderr)
    exit(1)
  }
  try data.write(to: URL(fileURLWithPath: outPath))
  print("Saved \(outPath) (\(data.count) bytes) at t=\(time.seconds)")
} catch {
  fputs("Error: \(error)\n", stderr)
  exit(1)
}
