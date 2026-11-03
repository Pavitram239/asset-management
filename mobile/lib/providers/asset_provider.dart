import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';
import '../models/asset.dart';
import '../services/api_service.dart';

class AssetProvider extends ChangeNotifier {
  final ApiService _api = ApiService();

  List<AssetModel> _assets = [];
  AssetModel? _selectedAsset;
  bool _isLoading = false;
  String? _errorMessage;
  int _totalProducts = 0;
  int _currentPage = 1;
  int _numOfPages = 1;
  String _searchQuery = '';
  String _selectedStatus = 'all';

  // Audit / Stocktaking Mode State
  bool _isAuditMode = false;
  final List<AssetModel> _auditedAssets = [];
  String? _lastAuditedMessage;

  List<AssetModel> get assets => _assets;
  AssetModel? get selectedAsset => _selectedAsset;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  int get totalProducts => _totalProducts;
  int get currentPage => _currentPage;
  int get numOfPages => _numOfPages;
  String get searchQuery => _searchQuery;
  String get selectedStatus => _selectedStatus;

  // Audit getters
  bool get isAuditMode => _isAuditMode;
  List<AssetModel> get auditedAssets => _auditedAssets;
  String? get lastAuditedMessage => _lastAuditedMessage;

  void toggleAuditMode() {
    _isAuditMode = !_isAuditMode;
    notifyListeners();
  }

  void clearAuditSession() {
    _auditedAssets.clear();
    _lastAuditedMessage = null;
    notifyListeners();
  }

  bool recordAudit(AssetModel asset) {
    if (_auditedAssets.any((a) => a.id == asset.id)) {
      _lastAuditedMessage = 'Already scanned: ${asset.productName}';
      notifyListeners();
      return false;
    }
    _auditedAssets.insert(0, asset);
    _lastAuditedMessage = 'Verified: ${asset.productName}';
    notifyListeners();
    return true;
  }

  List<AssetModel> getMyAssets(String currentUserId) {
    return _assets.where((a) => a.assignedToId == currentUserId).toList();
  }

  Future<void> fetchAssets({bool refresh = false}) async {
    if (refresh) {
      _currentPage = 1;
    }
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final response = await _api.getProducts(
        search: _searchQuery.isNotEmpty ? _searchQuery : null,
        productStatus: _selectedStatus != 'all' ? _selectedStatus : null,
        page: _currentPage,
      );

      final List items = response['products'] ?? [];
      final parsed = items.map((x) => AssetModel.fromJson(x as Map<String, dynamic>)).toList();

      if (_currentPage == 1) {
        _assets = parsed;
      } else {
        _assets.addAll(parsed);
      }

      _totalProducts = response['totalProducts'] ?? _assets.length;
      _numOfPages = response['numOfPages'] ?? 1;
      _currentPage = response['currentPage'] ?? 1;
    } on DioException catch (e) {
      _errorMessage = e.response?.data?['msg'] ?? e.message ?? 'Failed to load assets';
    } catch (e) {
      _errorMessage = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  void setSearchQuery(String query) {
    _searchQuery = query;
    fetchAssets(refresh: true);
  }

  void setStatusFilter(String status) {
    _selectedStatus = status;
    fetchAssets(refresh: true);
  }

  Future<AssetModel?> lookupAssetByIdOrQr(String scannedData) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    String assetId = scannedData.trim();
    if (assetId.contains('/')) {
      assetId = assetId.split('/').last;
    }

    // Check cached assets first by ID, serial number, or exact name
    final matchInCache = _assets.cast<AssetModel?>().firstWhere(
      (a) =>
          a?.id.toLowerCase() == assetId.toLowerCase() ||
          (a?.serialNumber != null && a!.serialNumber!.toLowerCase() == assetId.toLowerCase()) ||
          a?.productName.toLowerCase() == assetId.toLowerCase(),
      orElse: () => null,
    );
    if (matchInCache != null) {
      _selectedAsset = matchInCache;
      _isLoading = false;
      notifyListeners();
      return matchInCache;
    }

    try {
      final response = await _api.getProductById(assetId);
      if (response['product'] != null) {
        _selectedAsset = AssetModel.fromJson(response['product'] as Map<String, dynamic>);
        return _selectedAsset;
      }
      return null;
    } on DioException catch (e) {
      _errorMessage = e.response?.data?['msg'] ?? 'Asset not found for: $assetId';
      return null;
    } catch (e) {
      _errorMessage = 'Error looking up asset: $e';
      return null;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> updateAssetStatus(String assetId, String status) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final response = await _api.updateProduct(assetId, {
        'status': status,
        'productStatus': status,
      });

      if (response['updatedProduct'] != null) {
        final updated = AssetModel.fromJson(response['updatedProduct'] as Map<String, dynamic>);
        _selectedAsset = updated;
        final index = _assets.indexWhere((a) => a.id == assetId);
        if (index != -1) {
          _assets[index] = updated;
        }
      }
      _isLoading = false;
      notifyListeners();
      return true;
    } on DioException catch (e) {
      _isLoading = false;
      _errorMessage = e.response?.data?['msg'] ?? 'Failed to update asset status';
      notifyListeners();
      return false;
    } catch (e) {
      _isLoading = false;
      _errorMessage = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> assignAsset(String assetId, {required String assignedToId, required String department}) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final response = await _api.updateProduct(assetId, {
        'assignedToId': assignedToId,
        'department': department,
        'status': 'Not in Department',
      });

      if (response['updatedProduct'] != null) {
        final updated = AssetModel.fromJson(response['updatedProduct'] as Map<String, dynamic>);
        _selectedAsset = updated;
        final index = _assets.indexWhere((a) => a.id == assetId);
        if (index != -1) {
          _assets[index] = updated;
        }
      }
      _isLoading = false;
      notifyListeners();
      return true;
    } on DioException catch (e) {
      _isLoading = false;
      _errorMessage = e.response?.data?['msg'] ?? 'Failed to assign asset';
      notifyListeners();
      return false;
    } catch (e) {
      _isLoading = false;
      _errorMessage = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> returnAsset(String assetId) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final response = await _api.updateProduct(assetId, {
        'assignedToId': '',
        'status': 'In department',
      });

      if (response['updatedProduct'] != null) {
        final updated = AssetModel.fromJson(response['updatedProduct'] as Map<String, dynamic>);
        _selectedAsset = updated;
        final index = _assets.indexWhere((a) => a.id == assetId);
        if (index != -1) {
          _assets[index] = updated;
        }
      }
      _isLoading = false;
      notifyListeners();
      return true;
    } on DioException catch (e) {
      _isLoading = false;
      _errorMessage = e.response?.data?['msg'] ?? 'Failed to return asset';
      notifyListeners();
      return false;
    } catch (e) {
      _isLoading = false;
      _errorMessage = e.toString();
      notifyListeners();
      return false;
    }
  }
}
