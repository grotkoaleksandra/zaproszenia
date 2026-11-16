// Prepares a client photo for the halftone card, the same way as Ola's:
// cut the person out onto white, black-and-white, brighten the mid-tones,
// add contrast, then crop to the card window (3:4) around the person.
//   swift tools/photo.swift <in.jpg> <out.jpg> [gamma=0.45] [contrast=1.25] [crop=1]
import Vision
import CoreImage
import AppKit

let a = CommandLine.arguments
guard a.count >= 3 else { print("usage: photo.swift in out [gamma] [contrast] [crop]"); exit(2) }
let gamma = a.count > 3 ? Double(a[3])! : 0.45
let contrast = a.count > 4 ? Double(a[4])! : 1.25
let doCrop = a.count > 5 ? a[5] != "0" : true
guard var ci = CIImage(contentsOf: URL(fileURLWithPath: a[1]), options: [.applyOrientationProperty: true]) else { print("can't read photo"); exit(1) }
ci = ci.transformed(by: CGAffineTransform(translationX: -ci.extent.minX, y: -ci.extent.minY))

let req = VNGenerateForegroundInstanceMaskRequest()
let h = VNImageRequestHandler(ciImage: ci)
try h.perform([req])
guard let r = req.results?.first else { print("no person found: try a photo with a clearer subject"); exit(1) }
let maskBuf = try r.generateScaledMaskForImage(forInstances: r.allInstances, from: h)

// bounding box of the person (mask > 0.5), in image pixels, origin bottom-left like CoreImage
CVPixelBufferLockBaseAddress(maskBuf, .readOnly)
let mw = CVPixelBufferGetWidth(maskBuf), mh = CVPixelBufferGetHeight(maskBuf)
let rowBytes = CVPixelBufferGetBytesPerRow(maskBuf)
let base = CVPixelBufferGetBaseAddress(maskBuf)!
var minX = mw, maxX = 0, minY = mh, maxY = 0
for y in stride(from: 0, to: mh, by: 2) {
  let row = base.advanced(by: y * rowBytes).assumingMemoryBound(to: Float32.self)
  for x in stride(from: 0, to: mw, by: 2) where row[x] > 0.5 {
    if x < minX { minX = x }; if x > maxX { maxX = x }
    if y < minY { minY = y }; if y > maxY { maxY = y }
  }
}
CVPixelBufferUnlockBaseAddress(maskBuf, .readOnly)

let soft = CIImage(cvPixelBuffer: maskBuf).applyingGaussianBlur(sigma: 1.2).cropped(to: ci.extent)
let white = CIImage(color: CIColor.white).cropped(to: ci.extent)
var out = ci.applyingFilter("CIBlendWithMask", parameters: [kCIInputBackgroundImageKey: white, kCIInputMaskImageKey: soft])
out = out.applyingFilter("CIColorControls", parameters: ["inputSaturation": 0, "inputContrast": contrast])
out = out.applyingFilter("CIGammaAdjust", parameters: ["inputPower": gamma])

if doCrop && maxX > minX {
  // pixel buffer rows go top→bottom; CoreImage y goes bottom→top
  let W = ci.extent.width, H = ci.extent.height
  let sx = W / CGFloat(mw), sy = H / CGFloat(mh)
  let bx = CGFloat(minX) * sx, bw = CGFloat(maxX - minX) * sx
  let topY = H - CGFloat(minY) * sy, bh = CGFloat(maxY - minY) * sy
  // a 3:4 box with a little air around the person, head kept near the top
  var cw = max(bw * 1.12, bh * 1.08 * 3 / 4)
  var ch = cw * 4 / 3
  if cw > W { cw = W; ch = cw * 4 / 3 }
  if ch > H { ch = H; cw = ch * 3 / 4 }
  var x = bx + bw / 2 - cw / 2
  var y = topY + bh * 0.06 - ch
  x = min(max(0, x), W - cw); y = min(max(0, y), H - ch)
  out = out.cropped(to: CGRect(x: x, y: y, width: cw, height: ch))
  out = out.transformed(by: CGAffineTransform(translationX: -x, y: -y))
}
// at most 1240 px tall: plenty for the card, small for the web
let scale = min(1, 1240 / out.extent.height)
if scale < 1 { out = out.applyingFilter("CILanczosScaleTransform", parameters: ["inputScale": scale, "inputAspectRatio": 1]) }
try CIContext().writeJPEGRepresentation(of: out, to: URL(fileURLWithPath: a[2]),
  colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!, options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.85])
print("✓ photo: \(Int(out.extent.width))×\(Int(out.extent.height)) → \(a[2])")
