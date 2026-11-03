import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';
import '../models/user.dart';
import '../services/api_service.dart';
import '../services/storage_service.dart';

class AuthProvider extends ChangeNotifier {
  final ApiService _api = ApiService();
  final StorageService _storage = StorageService();

  UserModel? _user;
  List<Map<String, dynamic>> _organizations = [];
  String? _activeOrgId;
  String? _activeOrgName;
  bool _isLoading = false;
  String? _errorMessage;
  bool _isAuthenticated = false;

  UserModel? get user => _user;
  List<Map<String, dynamic>> get organizations => _organizations;
  String? get activeOrgId => _activeOrgId;
  String? get activeOrgName => _activeOrgName;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  bool get isAuthenticated => _isAuthenticated;

  Future<void> checkAuthStatus() async {
    _isLoading = true;
    notifyListeners();

    try {
      final token = await _storage.getToken();
      if (token == null || token.isEmpty) {
        _isAuthenticated = false;
        _isLoading = false;
        notifyListeners();
        return;
      }

      await _fetchCurrentUserAndOrganizations();
      _isAuthenticated = true;
    } catch (e) {
      _isAuthenticated = false;
      await _storage.clearAll();
      _api.resetClient();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> login(String email, String password) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final data = await _api.login(email, password);
      final token = data['token'] as String?;
      if (token == null || token.isEmpty) {
        throw Exception('Token not returned by server');
      }

      await _storage.saveToken(token);
      _api.resetClient();

      await _fetchCurrentUserAndOrganizations();

      _isAuthenticated = true;
      _isLoading = false;
      notifyListeners();
      return true;
    } on DioException catch (e) {
      _isLoading = false;
      _errorMessage = e.response?.data?['msg'] ?? e.message ?? 'Login failed';
      notifyListeners();
      return false;
    } catch (e) {
      _isLoading = false;
      _errorMessage = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<void> _fetchCurrentUserAndOrganizations() async {
    final response = await _api.getCurrentUser();
    if (response['user'] != null) {
      _user = UserModel.fromJson(response['user'] as Map<String, dynamic>);
    }

    if (response['organizations'] is List) {
      _organizations = List<Map<String, dynamic>>.from(response['organizations']);
      final savedOrgId = await _storage.getOrgId();

      if (savedOrgId != null && _organizations.any((o) => o['id'] == savedOrgId)) {
        _activeOrgId = savedOrgId;
        _activeOrgName = _organizations.firstWhere((o) => o['id'] == savedOrgId)['name'];
      } else if (_organizations.isNotEmpty) {
        _activeOrgId = _organizations.first['id'];
        _activeOrgName = _organizations.first['name'];
        if (_activeOrgId != null) {
          await _storage.saveOrgId(_activeOrgId!);
        }
      }
    }
  }

  Future<void> switchOrganization(String orgId) async {
    final org = _organizations.firstWhere((o) => o['id'] == orgId, orElse: () => {});
    if (org.isNotEmpty) {
      _activeOrgId = orgId;
      _activeOrgName = org['name'];
      await _storage.saveOrgId(orgId);
      _api.resetClient();
      await _fetchCurrentUserAndOrganizations();
      notifyListeners();
    }
  }

  Future<void> logout() async {
    await _storage.clearAll();
    _api.resetClient();
    _user = null;
    _organizations = [];
    _activeOrgId = null;
    _activeOrgName = null;
    _isAuthenticated = false;
    _errorMessage = null;
    notifyListeners();
  }
}
