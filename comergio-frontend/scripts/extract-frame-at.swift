import AVFoundation
import AppKit

let args = CommandLine.arguments
guard args.count >= 3 else {
  fputs("Usage: extract-frame-at.swift <video> <time-sec> <output.png>\n", stderr)
  exit(1)
}

let videoPath = args[1]
let timeSec = Double(args[2]) ?? 0
let outPath = args[3]

let url = URL(fileURLWithPath: videoPath)
let asset = AVAsset(url: url)
let duration = CMTimeGetSeconds(asset.duration)
let time = CMTime(seconds: min(max(0, timeSec), max(0, duration - 0.001)), preferredTimescale: 600)
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
  print("duration=\(duration) saved \(outPath) (\(data.count) bytes) at t=\(timeSec)")
} catch {
  fputs("Error: \(error)\n", stderr)
  exit(1)
}
