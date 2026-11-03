import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../config/constants.dart';
import '../models/asset.dart';
import '../providers/asset_provider.dart';
import '../providers/auth_provider.dart';
import 'asset_detail_screen.dart';

class AssetListScreen extends StatefulWidget {
  const AssetListScreen({super.key});

  @override
  State<AssetListScreen> createState() => _AssetListScreenState();
}

class _AssetListScreenState extends State<AssetListScreen> {
  final _searchController = TextEditingController();
  final _currencyFormat = NumberFormat.currency(symbol: '\$', decimalDigits: 0);
  bool _showOnlyMyAssets = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Provider.of<AssetProvider>(context, listen: false).fetchAssets(refresh: true);
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
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

  @override
  Widget build(BuildContext context) {
    final assetProvider = Provider.of<AssetProvider>(context);
    final auth = Provider.of<AuthProvider>(context);
    final currentUserId = auth.user?.id;
    final currentUserName = auth.user?.name.toLowerCase();

    final displayedAssets = _showOnlyMyAssets
        ? assetProvider.assets.where((a) {
            if (currentUserId != null && a.assignedToId == currentUserId) return true;
            if (currentUserName != null && a.assignedTo?.toLowerCase() == currentUserName) return true;
            return false;
          }).toList()
        : assetProvider.assets;

    return Scaffold(
      backgroundColor: AppConstants.backgroundColor,
      appBar: AppBar(
        title: const Text(
          'Asset Manager',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: AppConstants.textPrimary,
          ),
        ),
        backgroundColor: AppConstants.surfaceColor,
        elevation: 0,
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, color: AppConstants.borderLight),
        ),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header & Search section (matches DS/Inventory/Light in Figma)
          Container(
            color: AppConstants.surfaceColor,
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      _showOnlyMyAssets ? 'My Assets' : 'Inventory',
                      style: const TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.bold,
                        color: AppConstants.textPrimary,
                      ),
                    ),
                    InkWell(
                      onTap: () => setState(() => _showOnlyMyAssets = !_showOnlyMyAssets),
                      borderRadius: BorderRadius.circular(AppConstants.radiusControl),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: _showOnlyMyAssets ? AppConstants.primaryNavy : AppConstants.backgroundColor,
                          borderRadius: BorderRadius.circular(AppConstants.radiusControl),
                          border: Border.all(
                            color: _showOnlyMyAssets ? AppConstants.primaryNavy : AppConstants.borderLight,
                          ),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              _showOnlyMyAssets ? Icons.person : Icons.person_outline,
                              size: 16,
                              color: _showOnlyMyAssets ? Colors.white : AppConstants.textPrimary,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              'My Custody',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: _showOnlyMyAssets ? Colors.white : AppConstants.textPrimary,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  _showOnlyMyAssets
                      ? 'Equipment assigned to you'
                      : 'All departments · Admin access',
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppConstants.textSecondary,
                  ),
                ),
                const SizedBox(height: 14),

                // Name search (matches DS/Inventory/Light: 48px height, 8px radius)
                TextField(
                  controller: _searchController,
                  decoration: InputDecoration(
                    hintText: 'Search by asset name',
                    hintStyle: const TextStyle(color: AppConstants.textSecondary, fontSize: 14),
                    prefixIcon: const Icon(Icons.search, size: 20, color: AppConstants.textSecondary),
                    suffixIcon: _searchController.text.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear, size: 18, color: AppConstants.textSecondary),
                            onPressed: () {
                              _searchController.clear();
                              assetProvider.setSearchQuery('');
                            },
                          )
                        : null,
                    filled: true,
                    fillColor: AppConstants.surfaceColor,
                    contentPadding: const EdgeInsets.symmetric(vertical: 0, horizontal: 14),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AppConstants.radiusControl),
                      borderSide: const BorderSide(color: AppConstants.borderLight),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AppConstants.radiusControl),
                      borderSide: const BorderSide(color: AppConstants.borderLight),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AppConstants.radiusControl),
                      borderSide: const BorderSide(color: AppConstants.accentTeal, width: 2),
                    ),
                  ),
                  onSubmitted: (query) => assetProvider.setSearchQuery(query.trim()),
                ),
                const SizedBox(height: 12),

                // Status Filter Chips
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _buildFilterChip('All', 'all', assetProvider),
                      _buildFilterChip('In department', 'In department', assetProvider),
                      _buildFilterChip('In use', 'Not in Department', assetProvider),
                      _buildFilterChip('Out of campus', 'Out of campus', assetProvider),
                    ],
                  ),
                ),
              ],
            ),
          ),

          const Divider(height: 1, color: AppConstants.borderLight),

          // Asset List (matches DS/AssetCard in Figma)
          Expanded(
            child: RefreshIndicator(
              color: AppConstants.primaryNavy,
              onRefresh: () => assetProvider.fetchAssets(refresh: true),
              child: assetProvider.isLoading && displayedAssets.isEmpty
                  ? const Center(child: CircularProgressIndicator(color: AppConstants.primaryNavy))
                  : displayedAssets.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.inventory_2_outlined, size: 54, color: Colors.grey.shade400),
                              const SizedBox(height: 12),
                              Text(
                                _showOnlyMyAssets
                                    ? 'No equipment currently assigned to your account'
                                    : (assetProvider.searchQuery.isNotEmpty
                                        ? 'No assets found for "${assetProvider.searchQuery}"'
                                        : 'No assets available in this workspace'),
                                style: const TextStyle(color: AppConstants.textSecondary, fontSize: 14),
                              ),
                            ],
                          ),
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.all(16),
                          itemCount: displayedAssets.length,
                          separatorBuilder: (_, _) => const SizedBox(height: 14),
                          itemBuilder: (context, index) {
                            final asset = displayedAssets[index];
                            return _buildFigmaAssetCard(context, asset);
                          },
                        ),
            ),
          ),
        ],
      ),
    );
  }

  // Exact 1:1 Implementation of Figma DS/AssetCard (nodeId: 8:51723)
  Widget _buildFigmaAssetCard(BuildContext context, AssetModel asset) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppConstants.surfaceColor,
        borderRadius: BorderRadius.circular(AppConstants.radiusCard),
        border: Border.all(color: AppConstants.borderLight),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Asset Summary Row: 64x64 Image + Name/Category + Price
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  color: AppConstants.backgroundColor,
                  borderRadius: BorderRadius.circular(AppConstants.radiusControl),
                  border: Border.all(color: AppConstants.borderLight),
                ),
                child: const Icon(
                  Icons.devices_outlined,
                  color: AppConstants.primaryNavy,
                  size: 28,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      asset.productName,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.normal,
                        color: AppConstants.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      asset.company,
                      style: const TextStyle(
                        fontSize: 13,
                        color: AppConstants.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                _currencyFormat.format(asset.productPrice),
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppConstants.textPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Assignment & Department Row
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                asset.assignedTo != null && asset.assignedTo!.isNotEmpty
                    ? asset.assignedTo!
                    : 'Unassigned',
                style: const TextStyle(fontSize: 13, color: AppConstants.textSecondary),
              ),
              Text(
                asset.department ?? 'No Department',
                style: const TextStyle(fontSize: 13, color: AppConstants.textSecondary),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // Status Badge
          _buildStatusBadge(asset.productStatus),
          const SizedBox(height: 14),

          // Asset Actions Buttons (matches DS/AssetCard in Figma: 48px height, 8px radius, #172554 text)
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => AssetDetailScreen(assetId: asset.id, initialAsset: asset),
                      ),
                    );
                  },
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppConstants.primaryNavy,
                    side: const BorderSide(color: AppConstants.borderLight),
                    minimumSize: const Size.fromHeight(AppConstants.controlHeight),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppConstants.radiusControl),
                    ),
                  ),
                  child: const Text(
                    'View',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _showCardActions(context, asset),
                  icon: const Icon(Icons.more_horiz, size: 18, color: AppConstants.primaryNavy),
                  label: const Text(
                    'Actions',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                  ),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppConstants.primaryNavy,
                    side: const BorderSide(color: AppConstants.borderLight),
                    minimumSize: const Size.fromHeight(AppConstants.controlHeight),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppConstants.radiusControl),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChip(String label, String value, AssetProvider provider) {
    final isSelected = provider.selectedStatus == value;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(label),
        selected: isSelected,
        labelStyle: TextStyle(
          color: isSelected ? Colors.white : AppConstants.textPrimary,
          fontSize: 12,
          fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
        ),
        backgroundColor: AppConstants.surfaceColor,
        selectedColor: AppConstants.primaryNavy,
        checkmarkColor: Colors.white,
        side: BorderSide(
          color: isSelected ? AppConstants.primaryNavy : AppConstants.borderLight,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppConstants.radiusControl),
        ),
        onSelected: (_) => provider.setStatusFilter(value),
      ),
    );
  }

  void _showCardActions(BuildContext context, AssetModel asset) {
    final assetProvider = Provider.of<AssetProvider>(context, listen: false);

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppConstants.radiusCard)),
      ),
      backgroundColor: AppConstants.surfaceColor,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                asset.productName,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: AppConstants.textPrimary,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${asset.company} · ${asset.productStatus}',
                style: const TextStyle(color: AppConstants.textSecondary, fontSize: 13),
              ),
              const SizedBox(height: 16),
              ListTile(
                leading: const Icon(Icons.info_outline, color: AppConstants.accentTeal),
                title: const Text('View Full Details'),
                onTap: () {
                  Navigator.pop(ctx);
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => AssetDetailScreen(assetId: asset.id, initialAsset: asset),
                    ),
                  );
                },
              ),
              ListTile(
                leading: const Icon(Icons.sync_alt, color: AppConstants.primaryNavy),
                title: const Text('Change Status'),
                onTap: () {
                  Navigator.pop(ctx);
                  _showQuickStatusDialog(context, asset, assetProvider);
                },
              ),
              ListTile(
                leading: const Icon(Icons.keyboard_return, color: AppConstants.textSecondary),
                title: const Text('Return to Storage'),
                onTap: () async {
                  Navigator.pop(ctx);
                  final success = await assetProvider.returnAsset(asset.id);
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(success ? 'Asset returned successfully' : (assetProvider.errorMessage ?? 'Return failed')),
                        backgroundColor: success ? AppConstants.primaryNavy : AppConstants.badgeErrorText,
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

  void _showQuickStatusDialog(BuildContext context, AssetModel asset, AssetProvider assetProvider) {
    showDialog(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: const Text('Update Asset Status'),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppConstants.radiusCard),
        ),
        children: [
          'In department',
          'Not in Department',
          'Out of campus',
        ].map((s) {
          return SimpleDialogOption(
            onPressed: () async {
              Navigator.pop(ctx);
              final success = await assetProvider.updateAssetStatus(asset.id, s);
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(success ? 'Status updated to "$s"' : (assetProvider.errorMessage ?? 'Update failed')),
                    backgroundColor: success ? AppConstants.primaryNavy : AppConstants.badgeErrorText,
                  ),
                );
              }
            },
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(
                s == 'Not in Department' ? 'In use' : s,
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
