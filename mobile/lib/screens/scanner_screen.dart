import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';
import '../config/constants.dart';
import '../providers/asset_provider.dart';
import 'asset_detail_screen.dart';

class ScannerScreen extends StatefulWidget {
  const ScannerScreen({super.key});

  @override
  State<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends State<ScannerScreen> {
  final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.normal,
    facing: CameraFacing.back,
    torchEnabled: false,
  );

  bool _isProcessing = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_isProcessing) return;

    final List<Barcode> barcodes = capture.barcodes;
    if (barcodes.isEmpty) return;

    final String? rawValue = barcodes.first.rawValue;
    if (rawValue == null || rawValue.trim().isEmpty) return;

    _processScannedValue(rawValue);
  }

  Future<void> _processScannedValue(String rawValue) async {
    setState(() => _isProcessing = true);

    final assetProvider = Provider.of<AssetProvider>(context, listen: false);
    final asset = await assetProvider.lookupAssetByIdOrQr(rawValue);

    if (!mounted) return;

    if (asset != null) {
      if (assetProvider.isAuditMode) {
        // --- RAPID AUDIT MODE ---
        final isNew = assetProvider.recordAudit(asset);
        ScaffoldMessenger.of(context).clearSnackBars();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                Icon(
                  isNew ? Icons.check_circle : Icons.info_outline,
                  color: isNew ? Colors.white : AppConstants.badgeWarningBg,
                  size: 20,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    isNew
                        ? 'Audited: ${asset.productName}'
                        : 'Already audited: ${asset.productName}',
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                  ),
                ),
              ],
            ),
            backgroundColor: isNew ? AppConstants.accentTeal : AppConstants.primaryNavy,
            duration: const Duration(seconds: 1),
            behavior: SnackBarBehavior.floating,
          ),
        );
      } else {
        // --- NORMAL INSPECTION MODE ---
        await Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => AssetDetailScreen(assetId: asset.id, initialAsset: asset),
          ),
        );
      }
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(assetProvider.errorMessage ?? 'No asset found matching "$rawValue"'),
          backgroundColor: AppConstants.badgeErrorText,
          behavior: SnackBarBehavior.floating,
        ),
      );
    }

    // Delay before resuming scan to prevent debounce loops
    await Future.delayed(Duration(milliseconds: assetProvider.isAuditMode ? 1200 : 800));
    if (mounted) {
      setState(() => _isProcessing = false);
    }
  }

  void _showManualEntryDialog() {
    final textController = TextEditingController();

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Enter Asset ID or Serial'),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppConstants.radiusCard),
        ),
        content: TextField(
          controller: textController,
          autofocus: true,
          decoration: InputDecoration(
            hintText: 'e.g. 507f1f77-... or SN12345',
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppConstants.radiusControl),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel', style: TextStyle(color: AppConstants.textSecondary)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppConstants.primaryNavy,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AppConstants.radiusControl),
              ),
            ),
            onPressed: () {
              final query = textController.text.trim();
              Navigator.pop(ctx);
              if (query.isNotEmpty) {
                _processScannedValue(query);
              }
            },
            child: const Text('Lookup'),
          ),
        ],
      ),
    );
  }

  void _showAuditSessionSheet() {
    final assetProvider = Provider.of<AssetProvider>(context, listen: false);

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppConstants.radiusCard)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (context, setSheetState) => Container(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Audit Session (${assetProvider.auditedAssets.length})',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppConstants.textPrimary),
                  ),
                  TextButton.icon(
                    icon: const Icon(Icons.refresh, size: 16, color: AppConstants.badgeErrorText),
                    label: const Text('Clear', style: TextStyle(color: AppConstants.badgeErrorText)),
                    onPressed: () {
                      assetProvider.clearAuditSession();
                      Navigator.pop(ctx);
                    },
                  ),
                ],
              ),
              const Divider(height: 20),
              if (assetProvider.auditedAssets.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(
                    child: Text(
                      'No assets scanned yet in this audit session.',
                      style: TextStyle(color: AppConstants.textSecondary),
                    ),
                  ),
                )
              else
                Expanded(
                  child: ListView.separated(
                    shrinkWrap: true,
                    itemCount: assetProvider.auditedAssets.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (context, i) {
                      final item = assetProvider.auditedAssets[i];
                      return ListTile(
                        leading: const Icon(Icons.check_circle, color: AppConstants.accentTeal),
                        title: Text(item.productName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                        subtitle: Text('${item.company} · ${item.department ?? "General"}', style: const TextStyle(fontSize: 12)),
                        trailing: Text('Verified', style: TextStyle(color: Colors.green.shade700, fontSize: 12, fontWeight: FontWeight.bold)),
                      );
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final assetProvider = Provider.of<AssetProvider>(context);

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Camera Stream View
          MobileScanner(
            controller: _controller,
            onDetect: _onDetect,
          ),

          // Custom Viewfinder Overlay
          SafeArea(
            child: Column(
              children: [
                // Top control bar
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      // Mode Selector (Normal vs Audit)
                      InkWell(
                        onTap: () => assetProvider.toggleAuditMode(),
                        borderRadius: BorderRadius.circular(20),
                        child: Container(
                          decoration: BoxDecoration(
                            color: assetProvider.isAuditMode ? AppConstants.accentTeal : Colors.black.withValues(alpha: 0.6),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: assetProvider.isAuditMode ? AppConstants.accentTeal : Colors.white30,
                            ),
                          ),
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                          child: Row(
                            children: [
                              Icon(
                                assetProvider.isAuditMode ? Icons.fact_check : Icons.qr_code_scanner,
                                color: Colors.white,
                                size: 16,
                              ),
                              const SizedBox(width: 6),
                              Text(
                                assetProvider.isAuditMode ? 'Audit Mode ON' : 'Normal Scan',
                                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                              ),
                            ],
                          ),
                        ),
                      ),
                      Row(
                        children: [
                          IconButton(
                            icon: ValueListenableBuilder(
                              valueListenable: _controller,
                              builder: (context, state, child) {
                                return Icon(
                                  state.torchState == TorchState.on ? Icons.flash_on : Icons.flash_off,
                                  color: Colors.white,
                                );
                              },
                            ),
                            tooltip: 'Toggle Flash',
                            onPressed: () => _controller.toggleTorch(),
                          ),
                          IconButton(
                            icon: const Icon(Icons.flip_camera_android, color: Colors.white),
                            tooltip: 'Switch Camera',
                            onPressed: () => _controller.switchCamera(),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),

                // Audit Session HUD Badge if Audit mode is active
                if (assetProvider.isAuditMode)
                  InkWell(
                    onTap: _showAuditSessionSheet,
                    child: Container(
                      margin: const EdgeInsets.only(top: 8),
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.75),
                        borderRadius: BorderRadius.circular(24),
                        border: Border.all(color: AppConstants.accentTeal),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.playlist_add_check, color: AppConstants.accentTeal, size: 18),
                          const SizedBox(width: 8),
                          Text(
                            'Session: ${assetProvider.auditedAssets.length} Scanned',
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                          ),
                          const SizedBox(width: 6),
                          const Icon(Icons.keyboard_arrow_down, color: Colors.white70, size: 18),
                        ],
                      ),
                    ),
                  ),

                const Spacer(),

                // Visual target box
                Center(
                  child: Container(
                    width: 250,
                    height: 250,
                    decoration: BoxDecoration(
                      border: Border.all(
                        color: _isProcessing
                            ? AppConstants.accentTeal
                            : (assetProvider.isAuditMode ? AppConstants.accentTeal.withValues(alpha: 0.8) : Colors.white70),
                        width: 3,
                      ),
                      borderRadius: BorderRadius.circular(AppConstants.radiusCard),
                    ),
                    child: _isProcessing
                        ? const Center(
                            child: CircularProgressIndicator(color: AppConstants.accentTeal),
                          )
                        : null,
                  ),
                ),

                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.6),
                    borderRadius: BorderRadius.circular(AppConstants.radiusControl),
                  ),
                  child: Text(
                    assetProvider.isAuditMode
                        ? 'Rapid Audit Mode: Scan continuously to verify presence'
                        : 'Point camera at an asset QR code or barcode',
                    style: const TextStyle(color: Colors.white70, fontSize: 13),
                  ),
                ),

                const Spacer(),

                // Bottom actions
                Padding(
                  padding: const EdgeInsets.only(bottom: 24),
                  child: OutlinedButton.icon(
                    onPressed: _showManualEntryDialog,
                    icon: const Icon(Icons.keyboard, color: Colors.white, size: 18),
                    label: const Text(
                      'Type Asset ID Manually',
                      style: TextStyle(color: Colors.white, fontSize: 14),
                    ),
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: Colors.white54),
                      backgroundColor: Colors.black45,
                      minimumSize: const Size(220, AppConstants.controlHeight),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(AppConstants.radiusControl),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
