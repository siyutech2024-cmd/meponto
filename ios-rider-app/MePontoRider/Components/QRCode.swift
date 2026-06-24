import SwiftUI
import CoreImage.CIFilterBuiltins

// QR generation via CoreImage. Used for the rider's personal MePonto QR
// (partners scan to release a discount) and the invite QR.
enum QRGen {
    private static let context = CIContext()
    private static let filter = CIFilter.qrCodeGenerator()

    static func image(from string: String) -> UIImage {
        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"
        if let output = filter.outputImage {
            let scaled = output.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
            if let cg = context.createCGImage(scaled, from: scaled.extent) {
                return UIImage(cgImage: cg)
            }
        }
        return UIImage(systemName: "qrcode") ?? UIImage()
    }
}

struct QRCodeView: View {
    let value: String
    var size: CGFloat = 180

    var body: some View {
        Image(uiImage: QRGen.image(from: value))
            .interpolation(.none)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .padding(12)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
            .accessibilityLabel(Text("QR"))
    }
}

// A reusable bottom sheet showing a titled QR with a caption.
struct QRSheet: View {
    @EnvironmentObject var loc: LocalizationManager
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dismiss) private var dismiss
    let title: String
    let caption: String
    let value: String

    var body: some View {
        VStack(spacing: 18) {
            Capsule().fill(Theme.line(scheme)).frame(width: 40, height: 5).padding(.top, 8)
            Text(title).font(.headline).foregroundStyle(Theme.text(scheme))
            QRCodeView(value: value, size: 200)
            Text(caption)
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(Theme.muted(scheme))
                .padding(.horizontal, 24)
            Text(value)
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(Theme.textSoft(scheme))
            Spacer()
            PrimaryButton(title: loc.t("common.close")) { dismiss() }
                .padding(.horizontal, 24)
        }
        .padding(.bottom, 20)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.background(scheme))
    }
}
