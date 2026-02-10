import 'package:flutter/material.dart';

import '../../core/services/firestore_service.dart';
import '../../core/theme/app_theme.dart';

class IntroScreen extends StatefulWidget {
  const IntroScreen({super.key});

  @override
  State<IntroScreen> createState() => _IntroScreenState();
}

class _IntroScreenState extends State<IntroScreen> {
  final _fs = FirestoreService();
  Map<String, dynamic>? _content;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadContent();
  }

  Future<void> _loadContent() async {
    final data = await _fs.getStaticContent();
    if (mounted) {
      setState(() {
        _content = data;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('리그 소개')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _content == null
              ? const Center(
                  child: Text('콘텐츠를 불러올 수 없습니다.',
                      style: TextStyle(color: AppTheme.slate500)))
              : _buildContent(),
    );
  }

  Widget _buildContent() {
    final intro = _content?['intro'] as Map<String, dynamic>? ?? {};
    final sections = intro['sections'] as List<dynamic>? ?? [];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // 타이틀
        if (intro['heroTitle'] != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Text(
              intro['heroTitle'] as String,
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
          ),
        if (intro['tagline'] != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 20),
            child: Text(
              intro['tagline'] as String,
              style: const TextStyle(color: AppTheme.slate400, fontSize: 14),
            ),
          ),

        // 섹션들 (아코디언)
        ...sections.map((section) {
          final sec = section as Map<String, dynamic>;
          final title = sec['title'] as String? ?? '';
          final body = sec['body'] as String? ?? '';
          final items = sec['items'] as List<dynamic>? ?? [];

          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            decoration: BoxDecoration(
              color: AppTheme.slate800,
              borderRadius: BorderRadius.circular(12),
            ),
            child: ExpansionTile(
              title: Text(title,
                  style: const TextStyle(
                      color: Colors.white, fontWeight: FontWeight.w500)),
              childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              children: [
                if (body.isNotEmpty)
                  Text(body,
                      style: const TextStyle(
                          color: AppTheme.slate300, fontSize: 13)),
                ...items.map((item) {
                  if (item is String) {
                    return Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('• ',
                              style: TextStyle(color: AppTheme.slate400)),
                          Expanded(
                            child: Text(item,
                                style: const TextStyle(
                                    color: AppTheme.slate300, fontSize: 13)),
                          ),
                        ],
                      ),
                    );
                  }
                  return const SizedBox.shrink();
                }),
              ],
            ),
          );
        }),

        // 기본 소개 (Firestore에 데이터가 없을 경우)
        if (sections.isEmpty)
          const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'AUBL (Amateur University Baseball League)',
                style: TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.bold),
              ),
              SizedBox(height: 12),
              Text(
                '대학 아마추어 야구 리그로, 1981년 창설 이래 대학생들의 야구 열정을 이어오고 있습니다.',
                style: TextStyle(color: AppTheme.slate300, fontSize: 14),
              ),
            ],
          ),
      ],
    );
  }
}
