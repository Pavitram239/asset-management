import 'package:dio/dio.dart';
import 'storage_service.dart';

class ApiService {
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;
  ApiService._internal();

  Dio? _dio;
  final StorageService _storage = StorageService();

  Future<Dio> getClient() async {
    if (_dio != null) return _dio!;

    final baseUrl = await _storage.getBaseUrl();
    _dio = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 15),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );

    _dio!.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _storage.getToken();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }

          final orgId = await _storage.getOrgId();
          if (orgId != null && orgId.isNotEmpty) {
            options.headers['X-Organization-Id'] = orgId;
          }

          return handler.next(options);
        },
        onError: (DioException error, handler) async {
          // Could handle global 401 unauthenticated redirect here if needed
          return handler.next(error);
        },
      ),
    );

    return _dio!;
  }

  void resetClient() {
    _dio = null;
  }

  // --- Auth APIs ---
  Future<Map<String, dynamic>> login(String email, String password) async {
    final client = await getClient();
    final response = await client.post('/auth/login', data: {
      'email': email.trim().toLowerCase(),
      'password': password,
    });
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getCurrentUser() async {
    final client = await getClient();
    final response = await client.get('/users/current-user');
    return response.data as Map<String, dynamic>;
  }

  // --- Product / Asset APIs ---
  Future<Map<String, dynamic>> getProducts({
    String? search,
    String? productStatus,
    int page = 1,
    int limit = 20,
  }) async {
    final client = await getClient();
    final Map<String, dynamic> queryParams = {
      'page': page,
      'limit': limit,
    };
    if (search != null && search.isNotEmpty) {
      queryParams['search'] = search;
    }
    if (productStatus != null && productStatus.isNotEmpty && productStatus != 'all') {
      queryParams['productStatus'] = productStatus;
    }

    final response = await client.get('/products', queryParameters: queryParams);
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getProductById(String id) async {
    final client = await getClient();
    final response = await client.get('/products/$id');
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateProduct(String id, Map<String, dynamic> data) async {
    final client = await getClient();
    final response = await client.patch('/products/$id', data: data);
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getOverview() async {
    final client = await getClient();
    final response = await client.get('/products/overview');
    return response.data as Map<String, dynamic>;
  }
}
