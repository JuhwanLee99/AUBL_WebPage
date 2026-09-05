import 'package:aubl_flutter_app/core/theme/app_theme.dart';
import 'package:aubl_flutter_app/core/widgets/editor/rich_text_editor.dart';
import 'package:aubl_flutter_app/core/widgets/editor/table_embed.dart';
import 'package:aubl_flutter_app/features/help/user_manual_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Future<void> pumpCompact(
    WidgetTester tester,
    Widget home, {
    Size size = const Size(360, 800),
    double textScale = 2,
  }) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        localizationsDelegates: const [FlutterQuillLocalizations.delegate],
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!,
        ),
        home: home,
      ),
    );
    await tester.pump();
  }

  testWidgets('사용 설명서 탭은 360px 200%에서 모두 읽고 선택할 수 있다', (tester) async {
    await pumpCompact(tester, const UserManualScreen());

    expect(find.text('방문자'), findsOneWidget);
    expect(find.text('일반 회원'), findsOneWidget);
    expect(find.text('관리자/기록원'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('관리자/기록원'),
      260,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pump();
    expect(tester.takeException(), isNull);
    expect(tester.widget<TabBar>(find.byType(TabBar)).isScrollable, isTrue);

    await tester.tap(find.text('관리자/기록원'));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
  });

  testWidgets('표 편집 대화상자는 작은 화면과 키보드에서도 스크롤된다', (tester) async {
    await pumpCompact(
      tester,
      Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: FilledButton(
              onPressed: () => showAublTableEditorDialog(
                context: context,
                initialData: AublTableData.initial(),
              ),
              child: const Text('표 열기'),
            ),
          ),
        ),
      ),
      size: const Size(360, 640),
    );

    await tester.tap(find.text('표 열기'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);

    tester.view.viewInsets = const FakeViewPadding(bottom: 300);
    addTearDown(() => tester.view.viewInsets = FakeViewPadding.zero);
    await tester.showKeyboard(find.byType(TextFormField).first);
    await tester.pumpAndSettle();

    expect(find.text('적용'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('리치 텍스트 작성 폼은 360px 200% 키보드에서 끝까지 스크롤된다', (tester) async {
    await pumpCompact(
      tester,
      Scaffold(
        appBar: AppBar(title: const Text('게시글 작성')),
        body: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              const TextField(decoration: InputDecoration(labelText: '제목')),
              const SizedBox(height: 16),
              RichTextEditor(onChanged: (_) {}, minHeight: 220),
              const SizedBox(height: 16),
              const SwitchListTile(
                value: false,
                onChanged: null,
                title: Text('마지막 설정'),
              ),
            ],
          ),
        ),
      ),
      size: const Size(360, 640),
    );

    tester.view.viewInsets = const FakeViewPadding(bottom: 280);
    addTearDown(() => tester.view.viewInsets = FakeViewPadding.zero);
    await tester.tap(find.byType(TextField).first);
    await tester.pump();
    final formScrollable = find
        .descendant(
          of: find.byType(SingleChildScrollView).first,
          matching: find.byType(Scrollable),
        )
        .first;
    await tester.scrollUntilVisible(
      find.text('마지막 설정'),
      260,
      scrollable: formScrollable,
    );
    await tester.pump();

    expect(find.text('마지막 설정'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
