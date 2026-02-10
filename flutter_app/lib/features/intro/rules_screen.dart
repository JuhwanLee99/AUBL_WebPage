import 'package:flutter/material.dart';

import '../../core/services/firestore_service.dart';
import '../../core/theme/app_theme.dart';

class RulesScreen extends StatefulWidget {
  const RulesScreen({super.key});

  @override
  State<RulesScreen> createState() => _RulesScreenState();
}

class _RulesScreenState extends State<RulesScreen> {
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
      appBar: AppBar(title: const Text('회칙')),
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
    final rules = _content?['rules'] as Map<String, dynamic>? ?? {};
    final chapters = rules['chapters'] as List<dynamic>? ?? [];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (rules['headerBadge'] != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Text(
              rules['headerBadge'] as String,
              style: const TextStyle(
                  color: AppTheme.blue400,
                  fontSize: 12,
                  fontWeight: FontWeight.w600),
            ),
          ),

        ...chapters.map((chapter) {
          final ch = chapter as Map<String, dynamic>;
          final title = ch['title'] as String? ?? '';
          final articles = ch['articles'] as List<dynamic>? ?? [];

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
              children: articles.map((article) {
                if (article is Map<String, dynamic>) {
                  final aTitle = article['title'] as String? ?? '';
                  final aBody = article['body'] as String? ?? '';
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (aTitle.isNotEmpty)
                          Text(aTitle,
                              style: const TextStyle(
                                  color: AppTheme.blue400,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500)),
                        if (aBody.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text(aBody,
                                style: const TextStyle(
                                    color: AppTheme.slate300, fontSize: 13)),
                          ),
                      ],
                    ),
                  );
                }
                if (article is String) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text(article,
                        style: const TextStyle(
                            color: AppTheme.slate300, fontSize: 13)),
                  );
                }
                return const SizedBox.shrink();
              }).toList(),
            ),
          );
        }),

        if (chapters.isEmpty)
          const Text(
            '회칙 정보가 아직 등록되지 않았습니다.',
            style: TextStyle(color: AppTheme.slate500),
          ),
      ],
    );
  }
}
