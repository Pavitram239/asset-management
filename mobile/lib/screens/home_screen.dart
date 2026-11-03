import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/constants.dart';
import '../providers/auth_provider.dart';
import 'scanner_screen.dart';
import 'asset_list_screen.dart';
import 'login_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _currentIndex = 0;

  final List<Widget> _tabs = const [
    AssetListScreen(),
    ScannerScreen(),
    ProfileTab(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: _tabs,
      ),
      bottomNavigationBar: Container(
        height: 80,
        decoration: const BoxDecoration(
          color: AppConstants.surfaceColor,
          border: Border(
            top: BorderSide(color: AppConstants.borderLight, width: 1),
          ),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Row(
          children: [
            _buildNavItem(
              index: 0,
              icon: Icons.inventory_2_outlined,
              activeIcon: Icons.inventory_2,
              label: 'Inventory',
            ),
            _buildNavItem(
              index: 1,
              icon: Icons.qr_code_scanner,
              activeIcon: Icons.qr_code_scanner,
              label: 'Scanner',
            ),
            _buildNavItem(
              index: 2,
              icon: Icons.person_outline,
              activeIcon: Icons.person,
              label: 'Profile',
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNavItem({
    required int index,
    required IconData icon,
    required IconData activeIcon,
    required String label,
  }) {
    final isSelected = _currentIndex == index;

    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _currentIndex = index),
        borderRadius: BorderRadius.circular(AppConstants.radiusControl),
        child: Container(
          decoration: BoxDecoration(
            color: isSelected ? AppConstants.backgroundColor : Colors.transparent,
            borderRadius: BorderRadius.circular(AppConstants.radiusControl),
          ),
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                isSelected ? activeIcon : icon,
                size: 22,
                color: isSelected ? AppConstants.accentTeal : AppConstants.textSecondary,
              ),
              const SizedBox(height: 3),
              Text(
                label,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                  color: isSelected ? AppConstants.accentTeal : AppConstants.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ProfileTab extends StatelessWidget {
  const ProfileTab({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = Provider.of<AuthProvider>(context);
    final user = auth.user;

    return Scaffold(
      backgroundColor: AppConstants.backgroundColor,
      appBar: AppBar(
        title: const Text('Account & Workspace'),
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
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // User Card
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppConstants.surfaceColor,
                borderRadius: BorderRadius.circular(AppConstants.radiusCard),
                border: Border.all(color: AppConstants.borderLight),
              ),
              child: Row(
                children: [
                  Container(
                    width: 50,
                    height: 50,
                    decoration: BoxDecoration(
                      color: AppConstants.primaryNavy,
                      borderRadius: BorderRadius.circular(AppConstants.radiusControl),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      user?.name.isNotEmpty == true ? user!.name[0].toUpperCase() : 'U',
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          user?.name ?? 'Employee',
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.bold,
                            color: AppConstants.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          user?.email ?? '',
                          style: const TextStyle(fontSize: 13, color: AppConstants.textSecondary),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Workspace / Organization Selector
            const Text(
              'Active Workspace',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppConstants.textPrimary,
              ),
            ),
            const SizedBox(height: 10),
            Container(
              decoration: BoxDecoration(
                color: AppConstants.surfaceColor,
                borderRadius: BorderRadius.circular(AppConstants.radiusCard),
                border: Border.all(color: AppConstants.borderLight),
              ),
              child: auth.organizations.isEmpty
                  ? const Padding(
                      padding: EdgeInsets.all(16),
                      child: Text(
                        'No workspace memberships found',
                        style: TextStyle(color: AppConstants.textSecondary),
                      ),
                    )
                  : Column(
                      children: auth.organizations.map((org) {
                        final isSelected = org['id'] == auth.activeOrgId;
                        return ListTile(
                          title: Text(
                            org['name'] ?? 'Organization',
                            style: TextStyle(
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                              color: isSelected ? AppConstants.primaryNavy : AppConstants.textPrimary,
                            ),
                          ),
                          subtitle: Text(org['department'] ?? 'General'),
                          trailing: isSelected
                              ? const Icon(Icons.check_circle, color: AppConstants.accentTeal)
                              : null,
                          onTap: () => auth.switchOrganization(org['id']),
                        );
                      }).toList(),
                    ),
            ),
            const SizedBox(height: 36),

            // Logout Button
            OutlinedButton.icon(
              icon: const Icon(Icons.logout, color: AppConstants.badgeErrorText),
              label: const Text('Sign Out', style: TextStyle(color: AppConstants.badgeErrorText)),
              style: OutlinedButton.styleFrom(
                side: BorderSide(color: Colors.red.shade200),
                minimumSize: const Size.fromHeight(AppConstants.controlHeight),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppConstants.radiusControl),
                ),
              ),
              onPressed: () async {
                await auth.logout();
                if (context.mounted) {
                  Navigator.of(context).pushAndRemoveUntil(
                    MaterialPageRoute(builder: (_) => const LoginScreen()),
                    (route) => false,
                  );
                }
              },
            ),
          ],
        ),
      ),
    );
  }
}
