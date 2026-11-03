class UserModel {
  final String id;
  final String name;
  final String email;
  final String? role;
  final String? department;
  final String? organizationId;

  UserModel({
    required this.id,
    required this.name,
    required this.email,
    this.role,
    this.department,
    this.organizationId,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['_id'] ?? json['id'] ?? '',
      name: json['name'] ?? '',
      email: json['email'] ?? '',
      role: json['role'],
      department: json['department'],
      organizationId: json['organizationId'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      '_id': id,
      'name': name,
      'email': email,
      'role': role,
      'department': department,
      'organizationId': organizationId,
    };
  }
}
