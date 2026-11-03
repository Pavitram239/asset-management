import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/constants.dart';
import '../providers/auth_provider.dart';
import '../services/storage_service.dart';
import 'home_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController(text: 'admin@example.test');
  final _passwordController = TextEditingController(text: 'admin12345');
  bool _obscurePassword = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _submit() async {
    if (!_formKey.currentState!.validate()) return;

    final auth = Provider.of<AuthProvider>(context, listen: false);
    final success = await auth.login(
      _emailController.text,
      _passwordController.text,
    );

    if (success && mounted) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const HomeScreen()),
      );
    }
  }

  void _showServerSettings() async {
    final storage = StorageService();
    final currentUrl = await storage.getBaseUrl();
    final controller = TextEditingController(text: currentUrl);

    if (!mounted) return;

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('API Server URL'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'For Android Emulator use:\nhttp://10.0.2.2:5100/api/v1\n\nFor Physical Device use your PC\'s Wi-Fi IP:\nhttp://192.168.x.x:5100/api/v1',
              style: TextStyle(fontSize: 12, color: AppConstants.textSecondary),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              decoration: InputDecoration(
                labelText: 'Base URL',
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
              await storage.saveBaseUrl(controller.text.trim());
              if (ctx.mounted) Navigator.pop(ctx);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = Provider.of<AuthProvider>(context);

    return Scaffold(
      backgroundColor: AppConstants.backgroundColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined, color: AppConstants.textSecondary),
            tooltip: 'Server Settings',
            onPressed: _showServerSettings,
          ),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Brand Mark from Figma: 34x34px or scaled, Navy, boxes icon
                  Center(
                    child: Container(
                      width: 52,
                      height: 52,
                      decoration: BoxDecoration(
                        color: AppConstants.primaryNavy,
                        borderRadius: BorderRadius.circular(AppConstants.radiusControl),
                      ),
                      child: const Icon(
                        Icons.inventory_2,
                        size: 28,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  const Text(
                    'AssetOS',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.bold,
                      color: AppConstants.primaryNavy,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Mobile Operations & Scanner',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 14,
                      color: AppConstants.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 36),

                  if (auth.errorMessage != null)
                    Container(
                      padding: const EdgeInsets.all(12),
                      margin: const EdgeInsets.only(bottom: 20),
                      decoration: BoxDecoration(
                        color: AppConstants.badgeErrorBg,
                        borderRadius: BorderRadius.circular(AppConstants.radiusControl),
                        border: Border.all(color: Colors.red.shade200),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.error_outline, color: AppConstants.badgeErrorText, size: 20),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              auth.errorMessage!,
                              style: const TextStyle(color: AppConstants.badgeErrorText, fontSize: 13),
                            ),
                          ),
                        ],
                      ),
                    ),

                  // Email Input
                  TextFormField(
                    controller: _emailController,
                    keyboardType: TextInputType.emailAddress,
                    decoration: InputDecoration(
                      labelText: 'Work Email',
                      labelStyle: const TextStyle(color: AppConstants.textSecondary, fontSize: 14),
                      prefixIcon: const Icon(Icons.email_outlined, color: AppConstants.textSecondary),
                      filled: true,
                      fillColor: AppConstants.surfaceColor,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
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
                    validator: (val) {
                      if (val == null || val.trim().isEmpty) return 'Please enter your email';
                      if (!val.contains('@')) return 'Enter a valid email address';
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),

                  // Password Input
                  TextFormField(
                    controller: _passwordController,
                    obscureText: _obscurePassword,
                    decoration: InputDecoration(
                      labelText: 'Password',
                      labelStyle: const TextStyle(color: AppConstants.textSecondary, fontSize: 14),
                      prefixIcon: const Icon(Icons.lock_outline, color: AppConstants.textSecondary),
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscurePassword ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                          color: AppConstants.textSecondary,
                        ),
                        onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                      ),
                      filled: true,
                      fillColor: AppConstants.surfaceColor,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
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
                    validator: (val) {
                      if (val == null || val.isEmpty) return 'Please enter your password';
                      return null;
                    },
                  ),
                  const SizedBox(height: 28),

                  // Login Button (DS/Button/Primary in Figma)
                  SizedBox(
                    height: AppConstants.controlHeight,
                    child: ElevatedButton(
                      onPressed: auth.isLoading ? null : _submit,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppConstants.primaryNavy,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(AppConstants.radiusControl),
                        ),
                      ),
                      child: auth.isLoading
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                            )
                          : const Text(
                              'Sign In',
                              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                            ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
