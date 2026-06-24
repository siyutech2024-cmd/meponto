import SwiftUI
import AVFoundation
import AudioToolbox

// Two rider scan flows:
//  • scan a PARTNER QR  → apply a service discount (rider pays partner less)
//  • scan a STATION QR  → check in at the ponto and earn points
enum ScanOutcome {
    case partnerDiscount(name: String, discountBRL: Int, services: String, partnerPoints: Int)
    case checkIn(ponto: String, points: Int)
    case unknown(String)
}

struct ScanView: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var loc: LocalizationManager
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dismiss) private var dismiss
    @State private var outcome: ScanOutcome?
    @State private var cameraAvailable = ScanView.hasCamera()

    static func hasCamera() -> Bool {
        #if targetEnvironment(simulator)
        return false
        #else
        return AVCaptureDevice.default(for: .video) != nil
        #endif
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.background(scheme).ignoresSafeArea()

                if let outcome {
                    resultView(outcome)
                } else if cameraAvailable {
                    QRScannerRepresentable { code in handle(code) }
                        .ignoresSafeArea()
                    scannerOverlay
                } else {
                    noCameraView
                }
            }
            .navigationTitle(loc.t("scan.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(loc.t("common.close")) { dismiss() }
                }
            }
        }
    }

    // Decide what a scanned code means and apply its side effect.
    private func handle(_ code: String) {
        guard outcome == nil else { return }
        let c = code.lowercased()
        if c.contains("partner") || c.hasPrefix("crm-") {
            if let p = store.partners.first {
                // Records the partner service → partner earns points.
                store.recordPartnerService(p, code: code)
                outcome = .partnerDiscount(name: p.name, discountBRL: p.discountBRL,
                                           services: p.services, partnerPoints: p.partnerPoints)
            } else {
                outcome = .partnerDiscount(name: "Parceiro", discountBRL: 10, services: "", partnerPoints: 0)
            }
        } else if c.contains("ponto") || c.contains("checkin") || c.hasPrefix("p-") {
            outcome = .checkIn(ponto: store.profile.ponto, points: store.checkIn(pontoCode: code))
        } else {
            outcome = .unknown(code)
        }
    }

    private var scannerOverlay: some View {
        VStack {
            Spacer()
            RoundedRectangle(cornerRadius: 16)
                .stroke(Theme.accent(scheme), lineWidth: 3)
                .frame(width: 220, height: 220)
            Text(loc.t("scan.purpose"))
                .font(.subheadline).foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .padding(.top, 16).padding(.horizontal, 24)
            Spacer()
        }
        .padding()
    }

    private var noCameraView: some View {
        VStack(spacing: 16) {
            Image(systemName: "qrcode.viewfinder")
                .font(.system(size: 64))
                .foregroundStyle(Theme.accent(scheme))
            Text(loc.t("scan.purpose"))
                .font(.subheadline).foregroundStyle(Theme.muted(scheme))
                .multilineTextAlignment(.center)
            // Simulator has no camera → two explicit demo actions.
            PrimaryButton(title: loc.t("scan.scanPartner"), systemIcon: "tag.fill") {
                handle("crm-partner-demo")
            }
            .frame(maxWidth: 280)
            Button {
                handle("ponto-checkin-demo")
            } label: {
                HStack { Image(systemName: "mappin.circle.fill"); Text(loc.t("scan.scanPonto")).fontWeight(.semibold) }
                    .frame(maxWidth: 280).padding(.vertical, 12)
                    .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.line(scheme)))
                    .foregroundStyle(Theme.text(scheme))
            }
        }
        .padding(32)
    }

    @ViewBuilder
    private func resultView(_ outcome: ScanOutcome) -> some View {
        VStack(spacing: 16) {
            switch outcome {
            case let .partnerDiscount(name, discount, services, partnerPoints):
                Image(systemName: "tag.circle.fill").font(.system(size: 64)).foregroundStyle(Theme.ok(scheme))
                Text(loc.t("scan.discountApplied")).font(.headline).foregroundStyle(Theme.text(scheme))
                Text(name).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.textSoft(scheme))
                if !services.isEmpty { Text(services).font(.caption).foregroundStyle(Theme.muted(scheme)) }
                Text("-R$ \(discount)")
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .foregroundStyle(Theme.ok(scheme))
                Text(loc.t("scan.serviceDiscount")).font(.caption).foregroundStyle(Theme.muted(scheme))
                // Partner earns points for the recorded service.
                Badge(text: "\(loc.t("scan.partnerEarns")) +\(partnerPoints) pts", tone: .accent)
                    .padding(.top, 2)

            case let .checkIn(ponto, points):
                Image(systemName: "checkmark.seal.fill").font(.system(size: 64)).foregroundStyle(Theme.ok(scheme))
                Text(loc.t("scan.checkedIn")).font(.headline).foregroundStyle(Theme.text(scheme))
                Text(ponto).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.textSoft(scheme))
                Text("+\(points) pts")
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .foregroundStyle(Theme.accent(scheme))
                Text(loc.t("scan.pointsEarned")).font(.caption).foregroundStyle(Theme.muted(scheme))

            case let .unknown(code):
                Image(systemName: "qrcode").font(.system(size: 56)).foregroundStyle(Theme.muted(scheme))
                Text(loc.t("scan.result")).font(.headline).foregroundStyle(Theme.text(scheme))
                Text(code).font(.system(.caption, design: .monospaced)).foregroundStyle(Theme.textSoft(scheme))
            }

            PrimaryButton(title: loc.t("common.done"), systemIcon: "checkmark") { dismiss() }
                .frame(maxWidth: 260)
            Button(loc.t("scan.again")) { self.outcome = nil }
                .font(.subheadline).foregroundStyle(Theme.accent(scheme))
        }
        .padding(32)
    }
}

// AVFoundation QR scanner wrapped for SwiftUI.
struct QRScannerRepresentable: UIViewControllerRepresentable {
    let onScan: (String) -> Void

    func makeUIViewController(context: Context) -> QRScannerController {
        let vc = QRScannerController()
        vc.onScan = onScan
        return vc
    }

    func updateUIViewController(_ uiViewController: QRScannerController, context: Context) {}
}

final class QRScannerController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onScan: ((String) -> Void)?
    private let session = AVCaptureSession()
    private var preview: AVCaptureVideoPreviewLayer?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configureSession()
    }

    private func configureSession() {
        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else { return }
        session.addInput(input)

        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else { return }
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        output.metadataObjectTypes = [.qr]

        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        layer.frame = view.layer.bounds
        view.layer.addSublayer(layer)
        preview = layer
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        if !session.isRunning {
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                self?.session.startRunning()
            }
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        if session.isRunning { session.stopRunning() }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        preview?.frame = view.layer.bounds
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput,
                        didOutput metadataObjects: [AVMetadataObject],
                        from connection: AVCaptureConnection) {
        guard let obj = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              let value = obj.stringValue else { return }
        AudioServicesPlaySystemSound(SystemSoundID(kSystemSoundID_Vibrate))
        session.stopRunning()
        onScan?(value)
    }
}
