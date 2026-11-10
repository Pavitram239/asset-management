class AssetModel {
  final String id;
  final String productName;
  final String company;
  final double productPrice;
  final String productStatus;
  final String productWarranty;
  final String? department;
  final String? assignedTo;
  final String? assignedToId;
  final String? category;
  final String? serialNumber;
  final String? purchaseDate;
  final String? warrantyDate;
  final String? location;
  final String? productImg;
  final String? invoice;
  final String? qr;
  final String? createdAt;
  final String? catalogItemId;
  final String? damageNotes;
  final Map<String, dynamic>? capabilities;

  AssetModel({
    required this.id,
    required this.productName,
    required this.company,
    required this.productPrice,
    required this.productStatus,
    required this.productWarranty,
    this.department,
    this.assignedTo,
    this.assignedToId,
    this.category,
    this.serialNumber,
    this.purchaseDate,
    this.warrantyDate,
    this.location,
    this.productImg,
    this.invoice,
    this.qr,
    this.createdAt,
    this.catalogItemId,
    this.damageNotes,
    this.capabilities,
  });

  factory AssetModel.fromJson(Map<String, dynamic> json) {
    return AssetModel(
      id: json['_id'] ?? json['id'] ?? '',
      productName: json['name'] ?? json['productName'] ?? 'Unnamed Asset',
      company: json['company'] ?? 'Asset',
      productPrice: (json['productPrice'] is num)
          ? (json['productPrice'] as num).toDouble()
          : 0.0,
      productStatus: json['status'] ?? json['productStatus'] ?? 'In department',
      productWarranty: json['warranty'] ?? json['productWarranty'] ?? 'none',
      department: json['department'],
      assignedTo: json['assignedTo'],
      assignedToId: json['assignedToId'],
      category: json['category'],
      serialNumber: json['serialNumber'],
      purchaseDate: json['purchaseDate'],
      warrantyDate: json['warrantyDate'],
      location: json['location'],
      productImg: json['productImg'],
      invoice: json['invoice'],
      qr: json['qr'],
      createdAt: json['createdAt'],
      catalogItemId: json['catalogItemId'],
      damageNotes: json['damageNotes'] ?? (json['attributes'] is Map ? json['attributes']['damageNotes'] : null),
      capabilities: json['capabilities'] is Map<String, dynamic> ? json['capabilities'] : null,
    );
  }
      location: json['location'],
      productImg: json['productImg'],
      invoice: json['invoice'],
      qr: json['qr'],
      createdAt: json['createdAt'],
      capabilities: json['capabilities'] is Map<String, dynamic> ? json['capabilities'] : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      '_id': id,
      'name': productName,
      'company': company,
      'productPrice': productPrice,
      'status': productStatus,
      'warranty': productWarranty,
      'department': department,
      'assignedTo': assignedTo,
      'assignedToId': assignedToId,
      'category': category,
      'serialNumber': serialNumber,
      'purchaseDate': purchaseDate,
      'warrantyDate': warrantyDate,
      'location': location,
      'productImg': productImg,
      'invoice': invoice,
      'qr': qr,
      'createdAt': createdAt,
    };
  }

  bool get canUpdate => capabilities?['update'] == true;
  bool get canDelete => capabilities?['delete'] == true;
  bool get isCatalogLinked => catalogItemId != null && catalogItemId!.isNotEmpty;
}
