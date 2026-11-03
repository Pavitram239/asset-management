import 'package:flutter_test/flutter_test.dart';
import 'package:assetos_mobile/main.dart';

void main() {
  testWidgets('AssetOS app smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const AssetOSMobileApp());
    expect(find.byType(AssetOSMobileApp), findsOneWidget);
  });
}
