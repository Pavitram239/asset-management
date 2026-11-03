import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'config/constants.dart';
import 'providers/auth_provider.dart';
import 'providers/asset_provider.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const AssetOSMobileApp());
}

class AssetOSMobileApp extends StatelessWidget {
  const AssetOSMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()..checkAuthStatus()),
        ChangeNotifierProvider(create: (_) => AssetProvider()),
      ],
      child: MaterialApp(
        title: 'AssetOS Mobile',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          fontFamily: 'Inter',
          colorScheme: ColorScheme.fromSeed(
            seedColor: AppConstants.primaryNavy,
            primary: AppConstants.primaryNavy,
            secondary: AppConstants.accentTeal,
            surface: AppConstants.surfaceColor,
          ),
          scaffoldBackgroundColor: AppConstants.backgroundColor,
          appBarTheme: const AppBarTheme(
            backgroundColor: AppConstants.surfaceColor,
            foregroundColor: AppConstants.textPrimary,
            elevation: 0,
            centerTitle: false,
            titleTextStyle: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: AppConstants.textPrimary,
            ),
          ),
        ),
        home: const AuthGate(),
      ),
    );
  }
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = Provider.of<AuthProvider>(context);

    if (auth.isLoading && !auth.isAuthenticated) {
      return const Scaffold(
        backgroundColor: AppConstants.backgroundColor,
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircularProgressIndicator(color: AppConstants.primaryNavy),
              SizedBox(height: 16),
              Text(
                'Connecting to AssetOS...',
                style: TextStyle(color: AppConstants.textSecondary, fontSize: 14),
              ),
            ],
          ),
        ),
      );
    }

    if (auth.isAuthenticated) {
      return const HomeScreen();
    }

    return const LoginScreen();
  }
}
