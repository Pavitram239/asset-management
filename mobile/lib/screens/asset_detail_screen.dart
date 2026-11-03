import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import 'package:image_picker/image_picker.dart';
import '../config/constants.dart';
import '../models/asset.dart';
import '../providers/asset_provider.dart';

class AssetDetailScreen extends StatefulWidget {
  final String assetId;
  final AssetModel? initialAsset;

  const AssetDetailScreen({super.key, required this.assetId, this.initialAsset});

  @override
  State<AssetDetailScreen> createState() => _AssetDetailScreenState();
}

class _AssetDetailScreenState extends State<AssetDetailScreen> {
  final currencyFormat = NumberFormat.currency(symbol: '\$', decimalDigits: 2);
  final ImagePicker _picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Provider.of<AssetProvider>(context, listen: false).lookupAssetByIdOrQr(widget.assetId);
    });
  }

  Widget _buildStatusBadge(String status) {
    Color bg;
    Color text;
    String label = status.replaceAll('_', ' ').toLowerCase();

    switch (status.toLowerCase()) {
      case 'available':
      case 'in_department':
      case 'in department':
        bg = AppConstants.badgeSuccessBg;
        text = AppConstants.badgeSuccessText;
        label = 'In department';
        break;
      case 'assigned':
      case 'in_use':
      case 'in use':
      case 'not in department':
        bg = AppConstants.badgeWarningBg;
        text = AppConstants.badgeWarningText;
        label = 'In use';
        break;
      case 'under_maintenance':
      case 'out_of_campus':
      case 'out of campus':
        bg = AppConstants.badgeWarningBg;
        text = AppConstants.badgeWarningText;
        label = 'Out of campus';
        break;
      case 'damaged':
        bg = AppConstants.badgeErrorBg;
        text = AppConstants.badgeErrorText;
        label = 'Damaged';
        break;
      default:
        bg = AppConstants.badgeNeutralBg;
        text = AppConstants.badgeNeutralText;
        label = status.replaceAll('_', ' ');
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppConstants.radiusPill),
      ),
      child: Text(
        label[0].toUpperCase() + label.substring(1),
        style: TextStyle(
          color: text,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  void _showStatusDialog(AssetModel asset) {
    final assetProvider = Provider.of<AssetProvider>(context, listen: false);
    final statuses = [
      'In department',
      'Not in Department',
      'Out of campus',
    ];

    showDialog(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: const Text('Update Asset Status'),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppConstants.radiusCard),
        ),
        children: statuses.map((s) {
          final isSelected = s.toLowerCase() == asset.productStatus.toLowerCase();
          return SimpleDialogOption(
            onPressed: () async {
              Navigator.pop(ctx);
              final success = await assetProvider.updateAssetStatus(asset.id, s);
              if (mounted) {
                if (success) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Status updated to "$s"')),
                  );
                } else if (assetProvider.errorMessage != null) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(assetProvider.errorMessage!),
                      backgroundColor: AppConstants.badgeErrorText,
                    ),
                  );
                }
              }
            },
            child: Row(
              children: [
                _buildStatusBadge(s),
                const SizedBox(width: 12),
                if (isSelected) ...[
                  const Spacer(),
                  const Icon(Icons.check, size: 18, color: AppConstants.accentTeal),
                ],
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  void _showDamageReportDialog(AssetModel asset) {
    final assetProvider = Provider.of<AssetProvider>(context, listen: false);
    final noteController = TextEditingController();
    XFile? capturedImage;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppConstants.radiusCard)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(context).viewInsets.bottom + 20,
            left: 20,
            right: 20,
            top: 20,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Report Damage / Issue',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: AppConstants.textPrimary,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(ctx),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                'Reporting issue for: ${asset.productName}',
                style: const TextStyle(color: AppConstants.textSecondary, fontSize: 13),
              ),
              const SizedBox(height: 16),

              // Camera Photo Capture Section
              if (capturedImage != null)
                Stack(
                  alignment: Alignment.topRight,
                  children: [
                    Container(
                      height: 140,
                      width: double.infinity,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(AppConstants.radiusControl),
                        image: DecorationImage(
                          image: FileImage(File(capturedImage!.path)),
                          fit: BoxFit.cover,
                        ),
                      ),
                    ),
                    IconButton(
                      icon: const CircleAvatar(
                        radius: 14,
                        backgroundColor: Colors.black54,
                        child: Icon(Icons.close, size: 16, color: Colors.white),
                      ),
                      onPressed: () => setSheetState(() => capturedImage = null),
                    ),
                  ],
                )
              else
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        icon: const Icon(Icons.camera_alt, color: AppConstants.primaryNavy),
                        label: const Text('Take Photo', style: TextStyle(color: AppConstants.primaryNavy)),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size.fromHeight(48),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(AppConstants.radiusControl),
                          ),
                        ),
                        onPressed: () async {
                          final photo = await _picker.pickImage(source: ImageSource.camera, maxWidth: 1024);
                          if (photo != null) {
                            setSheetState(() => capturedImage = photo);
                          }
                        },
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: OutlinedButton.icon(
                        icon: const Icon(Icons.photo_library, color: AppConstants.textSecondary),
                        label: const Text('Gallery', style: TextStyle(color: AppConstants.textSecondary)),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size.fromHeight(48),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(AppConstants.radiusControl),
                          ),
                        ),
                        onPressed: () async {
                          final photo = await _picker.pickImage(source: ImageSource.gallery, maxWidth: 1024);
                          if (photo != null) {
                            setSheetState(() => capturedImage = photo);
                          }
                        },
                      ),
                    ),
                  ],
                ),
              const SizedBox(height: 16),

              TextField(
                controller: noteController,
                maxLines: 3,
                decoration: InputDecoration(
                  labelText: 'Damage description / notes',
                  hintText: 'e.g. Screen cracked, motor overheating...',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppConstants.radiusControl),
                  ),
                ),
              ),
              const SizedBox(height: 20),

              ElevatedButton.icon(
                icon: const Icon(Icons.report_problem_outlined, color: Colors.white),
                label: const Text('Submit Report', style: TextStyle(fontWeight: FontWeight.bold)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppConstants.badgeErrorText,
                  foregroundColor: Colors.white,
                  minimumSize: const Size.fromHeight(AppConstants.controlHeight),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppConstants.radiusControl),
                  ),
                ),
                onPressed: () async {
                  final messenger = ScaffoldMessenger.of(context);
                  Navigator.pop(ctx);
                  final success = await assetProvider.updateAssetStatus(asset.id, 'Out of campus');
                  if (mounted && success) {
                    messenger.showSnackBar(
                      const SnackBar(
                        content: Text('Issue logged: Asset marked Out of campus / Repair'),
                        backgroundColor: AppConstants.badgeErrorText,
                      ),
                    );
                  }
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showReturnDialog(AssetModel asset) {
    final assetProvider = Provider.of<AssetProvider>(context, listen: false);

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Return Asset'),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppConstants.radiusCard),
        ),
        content: Text(
          'Confirm return of "${asset.productName}" from ${asset.assignedTo ?? "current custodian"} back to available storage?',
          style: const TextStyle(color: AppConstants.textSecondary, fontSize: 14),
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
            onPressed: () async {
              Navigator.pop(ctx);
              final success = await assetProvider.returnAsset(asset.id);
              if (mounted) {
                if (success) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Asset returned successfully')),
                  );
                } else if (assetProvider.errorMessage != null) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(assetProvider.errorMessage!),
                      backgroundColor: AppConstants.badgeErrorText,
                    ),
                  );
                }
              }
            },
            child: const Text('Confirm Return'),
          ),
        ],
      ),
    );
  }

  void _showAssignDialog(AssetModel asset) {
    final assetProvider = Provider.of<AssetProvider>(context, listen: false);
    final userController = TextEditingController();
    final deptController = TextEditingController(text: asset.department ?? '');

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Assign Asset Custody'),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppConstants.radiusCard),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: userController,
              decoration: InputDecoration(
                labelText: 'Custodian User ID / Name',
                hintText: 'Enter employee ID',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppConstants.radiusControl),
                ),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: deptController,
              decoration: InputDecoration(
                labelText: 'Department',
                hintText: 'e.g. IT, Operations',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppConstants.radiusControl),
                ),
              ),
            ),
          ],
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
            onPressed: () async {
              final targetUser = userController.text.trim();
              if (targetUser.isEmpty) return;
              Navigator.pop(ctx);

              final success = await assetProvider.assignAsset(
                asset.id,
                assignedToId: targetUser,
                department: deptController.text.trim(),
              );

              if (mounted) {
                if (success) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Asset assigned successfully')),
                  );
                } else if (assetProvider.errorMessage != null) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(assetProvider.errorMessage!),
                      backgroundColor: AppConstants.badgeErrorText,
                    ),
                  );
                }
              }
            },
            child: const Text('Assign'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final assetProvider = Provider.of<AssetProvider>(context);
    final asset = (assetProvider.selectedAsset?.id == widget.assetId)
        ? assetProvider.selectedAsset
        : (widget.initialAsset ?? assetProvider.selectedAsset);

    if (asset == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Asset Details')),
        body: const Center(child: CircularProgressIndicator(color: AppConstants.primaryNavy)),
      );
    }

    return Scaffold(
      backgroundColor: AppConstants.backgroundColor,
      appBar: AppBar(
        title: Text(asset.productName, overflow: TextOverflow.ellipsis),
        backgroundColor: AppConstants.surfaceColor,
        foregroundColor: AppConstants.textPrimary,
        elevation: 0,
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, color: AppConstants.borderLight),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Status and Header Card (12px radius, subtle border)
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: AppConstants.surfaceColor,
                borderRadius: BorderRadius.circular(AppConstants.radiusCard),
                border: Border.all(color: AppConstants.borderLight),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _buildStatusBadge(asset.productStatus),
                      Text(
                        currencyFormat.format(asset.productPrice),
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: AppConstants.textPrimary,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Text(
                    asset.productName,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: AppConstants.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    asset.company,
                    style: const TextStyle(
                      fontSize: 14,
                      color: AppConstants.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'ID: ${asset.id}',
                    style: const TextStyle(
                      fontSize: 12,
                      fontFamily: 'monospace',
                      color: AppConstants.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 18),

            // Quick Actions Panel
            const Text(
              'Field Actions',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: AppConstants.textPrimary,
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    icon: const Icon(Icons.person_add_alt_1, size: 18),
                    label: const Text('Assign'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppConstants.primaryNavy,
                      foregroundColor: Colors.white,
                      elevation: 0,
                      minimumSize: const Size.fromHeight(AppConstants.controlHeight),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(AppConstants.radiusControl),
                      ),
                    ),
                    onPressed: () => _showAssignDialog(asset),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.keyboard_return, size: 18, color: AppConstants.primaryNavy),
                    label: const Text('Return'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppConstants.primaryNavy,
                      side: const BorderSide(color: AppConstants.borderLight),
                      minimumSize: const Size.fromHeight(AppConstants.controlHeight),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(AppConstants.radiusControl),
                      ),
                    ),
                    onPressed: () => _showReturnDialog(asset),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.edit_note, size: 18, color: AppConstants.primaryNavy),
                    label: const Text('Status'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppConstants.primaryNavy,
                      side: const BorderSide(color: AppConstants.borderLight),
                      minimumSize: const Size.fromHeight(AppConstants.controlHeight),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(AppConstants.radiusControl),
                      ),
                    ),
                    onPressed: () => _showStatusDialog(asset),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),

            // Damage / Problem Report Button with Camera
            OutlinedButton.icon(
              icon: const Icon(Icons.camera_alt_outlined, size: 18, color: AppConstants.badgeErrorText),
              label: const Text('Report Issue / Damage (Snap Photo)', style: TextStyle(color: AppConstants.badgeErrorText, fontWeight: FontWeight.w600)),
              style: OutlinedButton.styleFrom(
                side: BorderSide(color: Colors.red.shade200),
                backgroundColor: AppConstants.badgeErrorBg.withValues(alpha: 0.3),
                minimumSize: const Size.fromHeight(AppConstants.controlHeight),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppConstants.radiusControl),
                ),
              ),
              onPressed: () => _showDamageReportDialog(asset),
            ),
            const SizedBox(height: 20),

            // Metadata Grid Card
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: AppConstants.surfaceColor,
                borderRadius: BorderRadius.circular(AppConstants.radiusCard),
                border: Border.all(color: AppConstants.borderLight),
              ),
              child: Column(
                children: [
                  _buildDetailRow(
                    icon: Icons.person_outline,
                    label: 'Current Custodian',
                    value: asset.assignedTo?.isNotEmpty == true ? asset.assignedTo! : 'Unassigned',
                  ),
                  const Divider(height: 24, color: AppConstants.borderLight),
                  _buildDetailRow(
                    icon: Icons.business_outlined,
                    label: 'Department',
                    value: asset.department ?? 'None',
                  ),
                  const Divider(height: 24, color: AppConstants.borderLight),
                  _buildDetailRow(
                    icon: Icons.category_outlined,
                    label: 'Category / Make',
                    value: asset.company,
                  ),
                  const Divider(height: 24, color: AppConstants.borderLight),
                  _buildDetailRow(
                    icon: Icons.verified_outlined,
                    label: 'Warranty Status',
                    value: asset.productWarranty.toUpperCase(),
                  ),
                  if (asset.purchaseDate != null) ...[
                    const Divider(height: 24, color: AppConstants.borderLight),
                    _buildDetailRow(
                      icon: Icons.calendar_today_outlined,
                      label: 'Purchase Date',
                      value: asset.purchaseDate!,
                    ),
                  ],
                  if (asset.serialNumber != null) ...[
                    const Divider(height: 24, color: AppConstants.borderLight),
                    _buildDetailRow(
                      icon: Icons.pin_outlined,
                      label: 'Serial Number',
                      value: asset.serialNumber!,
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDetailRow({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Row(
      children: [
        Icon(icon, size: 20, color: AppConstants.textSecondary),
        const SizedBox(width: 12),
        Text(
          label,
          style: const TextStyle(fontSize: 14, color: AppConstants.textSecondary),
        ),
        const Spacer(),
        Text(
          value,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: AppConstants.textPrimary,
          ),
        ),
      ],
    );
  }
}
