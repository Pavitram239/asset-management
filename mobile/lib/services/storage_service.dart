import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/constants.dart';

class StorageService {
  static final StorageService _instance = StorageService._internal();
  factory StorageService() => _instance;
  StorageService._internal();

  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  Future<void> saveToken(String token) async {
    await _storage.write(key: AppConstants.keyToken, value: token);
  }

  Future<String?> getToken() async {
    return await _storage.read(key: AppConstants.keyToken);
  }

  Future<void> saveBaseUrl(String url) async {
    await _storage.write(key: AppConstants.keyBaseUrl, value: url);
  }

  Future<String> getBaseUrl() async {
    final customUrl = await _storage.read(key: AppConstants.keyBaseUrl);
    return customUrl ?? AppConstants.defaultBaseUrl;
  }

  Future<void> saveOrgId(String orgId) async {
    await _storage.write(key: AppConstants.keyOrgId, value: orgId);
  }

  Future<String?> getOrgId() async {
    return await _storage.read(key: AppConstants.keyOrgId);
  }

  Future<void> clearAll() async {
    await _storage.deleteAll();
  }
}
