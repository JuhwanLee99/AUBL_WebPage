import 'package:flutter/material.dart';

import '../../core/data/default_rules.dart';
import '../../core/services/cache_service.dart';
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
    // 캐시에서 즉시 로드
    final cached = await CacheService.instance.getCachedStaticContent();
    if (cached != null && _loading) {
      if (mounted) {
        setState(() {
          _content = cached;
          _loading = false;
        });
      }
    }

    // 네트워크에서 최신 데이터
    try {
      final data = await _fs.getStaticContent();
      if (mounted) {
        setState(() {
          _content = data;
          _loading = false;
        });
      }
      if (data != null) {
        CacheService.instance.cacheStaticContent(data);
      }
    } catch (_) {
      if (mounted && _loading) setState(() => _loading = false);
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

    // Firestore에 데이터가 있으면 Firestore 데이터, 없으면 하드코딩 기본값 사용
    if (chapters.isNotEmpty) {
      return _buildFirestoreChapters(rules, chapters);
    }
    return _buildDefaultChapters();
  }

  Widget _buildFirestoreChapters(
      Map<String, dynamic> rules, List<dynamic> chapters) {
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
                  final rawBody = article['body'];
                  // body가 List<String> 또는 String일 수 있음
                  final bodyLines = <String>[];
                  if (rawBody is List) {
                    bodyLines.addAll(rawBody.map((e) => e.toString()));
                  } else if (rawBody is String && rawBody.isNotEmpty) {
                    bodyLines.add(rawBody);
                  }
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (aTitle.isNotEmpty)
                          Text(aTitle,
                              style: const TextStyle(
                                  color: AppTheme.blue400,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600)),
                        ...bodyLines.map((line) {
                          if (line.isEmpty) {
                            return const SizedBox(height: 6);
                          }
                          return Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(line,
                                style: const TextStyle(
                                    color: AppTheme.slate300,
                                    fontSize: 13,
                                    height: 1.5)),
                          );
                        }),
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
      ],
    );
  }

  Widget _buildDefaultChapters() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: defaultRuleChapters.map((chapter) {
        final accentColor = Color(chapter.accent);
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          decoration: BoxDecoration(
            color: AppTheme.slate800,
            borderRadius: BorderRadius.circular(12),
          ),
          child: ExpansionTile(
            title: Text(chapter.title,
                style: const TextStyle(
                    color: Colors.white, fontWeight: FontWeight.w500)),
            childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            children: chapter.articles.map((article) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(article.title,
                        style: TextStyle(
                            color: accentColor,
                            fontSize: 13,
                            fontWeight: FontWeight.w600)),
                    const SizedBox(height: 4),
                    ...article.body.map((line) {
                      if (line.isEmpty) {
                        return const SizedBox(height: 6);
                      }
                      return Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(line,
                            style: const TextStyle(
                                color: AppTheme.slate300,
                                fontSize: 13,
                                height: 1.5)),
                      );
                    }),
                  ],
                ),
              );
            }).toList(),
          ),
        );
      }).toList(),
    );
  }
}
