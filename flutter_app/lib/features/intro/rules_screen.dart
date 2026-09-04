import 'package:flutter/material.dart';

import '../../core/data/default_rules.dart';
import '../../core/services/cache_service.dart';
import '../../core/services/firestore_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/season_components.dart';

class RulesScreen extends StatefulWidget {
  const RulesScreen({super.key});

  @override
  State<RulesScreen> createState() => _RulesScreenState();
}

class _RulesScreenState extends State<RulesScreen> {
  final _fs = FirestoreService();
  final TextEditingController _searchController = TextEditingController();
  Map<String, dynamic>? _content;
  bool _loading = true;
  String _searchQuery = '';
  List<String> _searchTerms = [];
  RegExp? _highlightRegex;
  List<GlobalKey> _searchResultAnchors = [];
  int _currentResultIndex = -1;

  bool get _hasSearchQuery => _searchTerms.isNotEmpty;
  String get _trimmedQuery => _searchQuery.trim();

  @override
  void initState() {
    super.initState();
    _loadContent();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
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

  void _updateSearchQuery(String value) {
    final terms = value
        .toLowerCase()
        .split(RegExp(r'\s+'))
        .map((term) => term.trim())
        .where((term) => term.isNotEmpty)
        .toList(growable: false);
    final sortedTerms = [...terms]
      ..sort((a, b) => b.length.compareTo(a.length));

    setState(() {
      _searchQuery = value;
      _searchTerms = terms;
      _currentResultIndex = -1;
      _highlightRegex = sortedTerms.isEmpty
          ? null
          : RegExp(
              sortedTerms.map(RegExp.escape).join('|'),
              caseSensitive: false,
            );
    });
  }

  void _syncSearchResultAnchors(List<GlobalKey> anchors) {
    _searchResultAnchors = anchors;
    if (_searchResultAnchors.isEmpty) {
      _currentResultIndex = -1;
      return;
    }
    if (_currentResultIndex >= _searchResultAnchors.length) {
      _currentResultIndex = _searchResultAnchors.length - 1;
    }
  }

  void _moveSearchResult(int step) {
    final total = _searchResultAnchors.length;
    if (!_hasSearchQuery || total == 0) return;
    final baseIndex = _currentResultIndex == -1
        ? (step > 0 ? -1 : 0)
        : _currentResultIndex;
    final next = (baseIndex + step) % total;
    final normalized = next < 0 ? next + total : next;
    setState(() => _currentResultIndex = normalized);
    _scrollToSearchResult(normalized);
  }

  void _scrollToSearchResult(int index) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (index < 0 || index >= _searchResultAnchors.length) return;
      final targetContext = _searchResultAnchors[index].currentContext;
      if (targetContext == null) return;
      Scrollable.ensureVisible(
        targetContext,
        duration: const Duration(milliseconds: 260),
        curve: Curves.easeInOut,
        alignment: 0.12,
      );
    });
  }

  bool _matchesQueryInFields(Iterable<String> fields) {
    if (!_hasSearchQuery) return true;
    final loweredFields = fields
        .map((field) => field.toLowerCase())
        .where((field) => field.isNotEmpty)
        .toList(growable: false);
    if (loweredFields.isEmpty) return false;
    return _searchTerms.every(
      (term) => loweredFields.any((field) => field.contains(term)),
    );
  }

  List<TextSpan> _buildHighlightedSpans(String text, TextStyle baseStyle) {
    final regex = _highlightRegex;
    if (regex == null || text.isEmpty) {
      return [TextSpan(text: text, style: baseStyle)];
    }

    final matches = regex.allMatches(text).toList(growable: false);
    if (matches.isEmpty) {
      return [TextSpan(text: text, style: baseStyle)];
    }

    final spans = <TextSpan>[];
    var cursor = 0;
    final highlightStyle = baseStyle.copyWith(
      backgroundColor: context.aublColors.warning.withValues(alpha: 0.35),
      fontWeight: FontWeight.w700,
      color: context.aublColors.ink,
    );

    for (final match in matches) {
      if (match.start > cursor) {
        spans.add(
          TextSpan(text: text.substring(cursor, match.start), style: baseStyle),
        );
      }
      spans.add(
        TextSpan(
          text: text.substring(match.start, match.end),
          style: highlightStyle,
        ),
      );
      cursor = match.end;
    }
    if (cursor < text.length) {
      spans.add(TextSpan(text: text.substring(cursor), style: baseStyle));
    }
    return spans;
  }

  Widget _buildHighlightedText(String text, TextStyle style) {
    return RichText(
      text: TextSpan(children: _buildHighlightedSpans(text, style)),
    );
  }

  List<String> _extractBodyLines(Object? rawBody) {
    if (rawBody is List) {
      return rawBody.map((line) => line.toString()).toList(growable: false);
    }
    if (rawBody is String && rawBody.isNotEmpty) {
      return [rawBody];
    }
    return [];
  }

  bool _matchesFirestoreArticle(dynamic article) {
    if (article is Map) {
      final map = Map<String, dynamic>.from(article);
      final title = map['title']?.toString() ?? '';
      final bodyLines = _extractBodyLines(map['body']);
      return _matchesQueryInFields([title, ...bodyLines]);
    }
    if (article is String) {
      return _matchesQueryInFields([article]);
    }
    return false;
  }

  Widget _buildSearchField() {
    final resultCount = _searchResultAnchors.length;
    final hasResult = _hasSearchQuery && resultCount > 0;
    final canNavigate = hasResult;
    final positionLabel = hasResult && _currentResultIndex >= 0
        ? '${_currentResultIndex + 1}/$resultCount'
        : '';

    final navigation = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _SearchResultButton(
          tooltip: '이전 검색 결과',
          icon: Icons.keyboard_arrow_up,
          onPressed: canNavigate ? () => _moveSearchResult(-1) : null,
        ),
        const SizedBox(width: 6),
        _SearchResultButton(
          tooltip: '다음 검색 결과',
          icon: Icons.keyboard_arrow_down,
          onPressed: canNavigate ? () => _moveSearchResult(1) : null,
        ),
        if (positionLabel.isNotEmpty) ...[
          const SizedBox(width: 8),
          Text(
            positionLabel,
            style: Theme.of(
              context,
            ).textTheme.labelSmall?.copyWith(color: context.aublColors.muted),
          ),
        ],
      ],
    );
    final searchField = TextField(
      controller: _searchController,
      onChanged: _updateSearchQuery,
      textInputAction: TextInputAction.search,
      decoration: InputDecoration(
        hintText: '키워드로 회칙 검색',
        prefixIcon: const Icon(Icons.search, size: 20),
        suffixIcon: _trimmedQuery.isEmpty
            ? null
            : IconButton(
                tooltip: '검색어 지우기',
                onPressed: () {
                  _searchController.clear();
                  _updateSearchQuery('');
                  FocusScope.of(context).unfocus();
                },
                icon: const Icon(Icons.close, size: 20),
              ),
      ),
    );

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final stack =
              constraints.maxWidth < 440 ||
              MediaQuery.textScalerOf(context).scale(1) >= 1.5;
          if (stack) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [searchField, const SizedBox(height: 8), navigation],
            );
          }
          return Row(
            children: [
              Expanded(child: searchField),
              const SizedBox(width: 8),
              navigation,
            ],
          );
        },
      ),
    );
  }

  Widget _buildSearchSummary(int resultCount) {
    final positionText = _currentResultIndex >= 0 && resultCount > 0
        ? ' (${_currentResultIndex + 1}/$resultCount)'
        : '';
    final text = resultCount == 0
        ? '"$_trimmedQuery" 검색 결과가 없습니다.'
        : '"$_trimmedQuery" 검색 결과 $resultCount건$positionText';
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(
        text,
        style: TextStyle(
          color: context.aublColors.muted,
          fontSize: 12,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }

  Widget _buildNoResultCard() {
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.aublColors.surface,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: context.aublColors.line),
      ),
      child: Text(
        '일치하는 회칙 항목이 없습니다. 다른 키워드로 검색해 주세요.',
        style: TextStyle(color: context.aublColors.muted, fontSize: 13),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('회칙')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _content == null
          ? Center(
              child: Text(
                '콘텐츠를 불러올 수 없습니다.',
                style: TextStyle(color: context.aublColors.muted),
              ),
            )
          : _buildContent(),
    );
  }

  Widget _buildContent() {
    final rules = _content?['rules'] as Map<String, dynamic>? ?? {};
    final chapters = rules['chapters'] as List<dynamic>? ?? [];

    // Firestore에 데이터가 있으면 Firestore 데이터, 없으면 하드코딩 기본값 사용
    final listResult = chapters.isNotEmpty
        ? _buildFirestoreChapters(rules, chapters)
        : _buildDefaultChapters();
    _syncSearchResultAnchors(listResult.resultAnchors);

    return SafeArea(
      top: false,
      child: LayoutBuilder(
        builder: (context, constraints) => Align(
          alignment: Alignment.topCenter,
          child: SizedBox(
            width: constraints.maxWidth > 1180 ? 1180 : constraints.maxWidth,
            height: constraints.maxHeight,
            child: Column(
              children: [
                const Padding(
                  padding: EdgeInsets.fromLTRB(12, 8, 12, 16),
                  child: SeasonPageHero(
                    eyebrow: 'AUBL DOCUMENTS',
                    title: Text('AUBL 회칙'),
                    description: '리그 운영 기준과 경기 규정을 항목별로 확인하세요.',
                  ),
                ),
                _buildSearchField(),
                Expanded(child: listResult.listView),
              ],
            ),
          ),
        ),
      ),
    );
  }

  List<String> _resolveHostOrder(Object? raw) {
    if (raw is List) {
      final parsed = raw
          .map((e) => e.toString().trim())
          .where((e) => e.isNotEmpty)
          .toList();
      if (parsed.isNotEmpty) return parsed;
    }
    return defaultRuleHostOrder;
  }

  String _resolveAppendixText(Object? raw) {
    if (raw is String && raw.trim().isNotEmpty) {
      return raw.trim();
    }
    return defaultRuleAppendixText;
  }

  Widget _buildHostOrderSection(List<MapEntry<int, String>> hostOrderEntries) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.aublColors.surface,
        borderRadius: BorderRadius.circular(4),
        border: Border(
          top: BorderSide(color: context.aublColors.line),
          right: BorderSide(color: context.aublColors.line),
          bottom: BorderSide(color: context.aublColors.line),
          left: BorderSide(color: context.aublColors.cobalt, width: 3),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.history, size: 16, color: context.aublColors.cobalt),
              const SizedBox(width: 8),
              Text(
                '연합회교 순서',
                style: TextStyle(
                  color: context.aublColors.ink,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: hostOrderEntries.map((entry) {
              final index = entry.key + 1;
              final name = entry.value;
              final indexStyle = TextStyle(
                color: context.aublColors.cobalt,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              );
              final valueStyle = TextStyle(
                color: context.aublColors.ink,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              );
              return Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 7,
                ),
                decoration: BoxDecoration(
                  color: context.aublColors.surfaceMuted,
                  borderRadius: BorderRadius.circular(3),
                  border: Border.all(color: context.aublColors.line),
                ),
                child: RichText(
                  text: TextSpan(
                    children: [
                      TextSpan(text: '$index ', style: indexStyle),
                      ..._buildHighlightedSpans(name, valueStyle),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildAppendixSection(String appendixText) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.aublColors.surface,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: context.aublColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '부칙',
            style: TextStyle(
              color: context.aublColors.ink,
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          _buildHighlightedText(
            appendixText,
            TextStyle(
              color: context.aublColors.muted,
              fontSize: 13,
              height: 1.6,
            ),
          ),
        ],
      ),
    );
  }

  _RulesListBuildResult _buildFirestoreChapters(
    Map<String, dynamic> rules,
    List<dynamic> chapters,
  ) {
    final hostOrder = _resolveHostOrder(rules['hostOrder']);
    final appendixText = _resolveAppendixText(rules['appendixText']);
    final hostOrderEntries = hostOrder.asMap().entries.toList(growable: false);
    final filteredHostOrderEntries = _hasSearchQuery
        ? hostOrderEntries
              .where((entry) => _matchesQueryInFields([entry.value]))
              .toList(growable: false)
        : hostOrderEntries;
    final appendixVisible =
        !_hasSearchQuery || _matchesQueryInFields([appendixText]);

    final rawHeaderBadge = rules['headerBadge'];
    final headerBadge = rawHeaderBadge is String ? rawHeaderBadge : null;
    final headerBadgeVisible =
        headerBadge != null &&
        (!_hasSearchQuery || _matchesQueryInFields([headerBadge]));

    final chapterWidgets = <Widget>[];
    final chapterAnchors = <GlobalKey>[];
    final resultAnchors = <GlobalKey>[];
    for (final chapter in chapters) {
      if (chapter is! Map) continue;
      final ch = Map<String, dynamic>.from(chapter);
      final title = ch['title']?.toString() ?? '';
      final articles = (ch['articles'] as List<dynamic>?) ?? <dynamic>[];
      final chapterTitleMatched = _matchesQueryInFields([title]);
      final visibleArticles = (!_hasSearchQuery || chapterTitleMatched)
          ? articles
          : articles.where(_matchesFirestoreArticle).toList();

      if (_hasSearchQuery && !chapterTitleMatched && visibleArticles.isEmpty) {
        continue;
      }

      final chapterAnchor = GlobalKey();
      if (_hasSearchQuery) {
        chapterAnchors.add(chapterAnchor);
      }
      chapterWidgets.add(
        Container(
          key: _hasSearchQuery ? chapterAnchor : null,
          margin: const EdgeInsets.only(bottom: 8),
          decoration: BoxDecoration(
            color: context.aublColors.surface,
            borderRadius: BorderRadius.circular(4),
            border: Border.all(color: context.aublColors.line),
          ),
          child: ExpansionTile(
            key: PageStorageKey('firestore-$title'),
            initiallyExpanded: _hasSearchQuery,
            title: _buildHighlightedText(
              title,
              TextStyle(
                color: context.aublColors.ink,
                fontWeight: FontWeight.w500,
              ),
            ),
            childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            children: visibleArticles.map((article) {
              if (article is Map) {
                final articleMap = Map<String, dynamic>.from(article);
                final aTitle = articleMap['title']?.toString() ?? '';
                final bodyLines = _extractBodyLines(articleMap['body']);
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (aTitle.isNotEmpty)
                        _buildHighlightedText(
                          aTitle,
                          TextStyle(
                            color: context.aublColors.cobalt,
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ...bodyLines.map((line) {
                        if (line.isEmpty) {
                          return const SizedBox(height: 6);
                        }
                        return Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: _buildHighlightedText(
                            line,
                            TextStyle(
                              color: context.aublColors.ink,
                              fontSize: 13,
                              height: 1.5,
                            ),
                          ),
                        );
                      }),
                    ],
                  ),
                );
              }
              if (article is String) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: _buildHighlightedText(
                    article,
                    TextStyle(color: context.aublColors.ink, fontSize: 13),
                  ),
                );
              }
              return const SizedBox.shrink();
            }).toList(),
          ),
        ),
      );
    }

    final headerBadgeAnchor = GlobalKey();
    if (_hasSearchQuery && headerBadgeVisible) {
      resultAnchors.add(headerBadgeAnchor);
    }
    if (_hasSearchQuery) {
      resultAnchors.addAll(chapterAnchors);
    }

    final hostOrderAnchor = GlobalKey();
    if (_hasSearchQuery && filteredHostOrderEntries.isNotEmpty) {
      resultAnchors.add(hostOrderAnchor);
    }

    final appendixAnchor = GlobalKey();
    if (_hasSearchQuery && appendixVisible) {
      resultAnchors.add(appendixAnchor);
    }

    final resultCount = resultAnchors.length;
    final hasResult = resultCount > 0;

    final listView = ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (_hasSearchQuery) _buildSearchSummary(resultCount),
        if (_hasSearchQuery && !hasResult)
          _buildNoResultCard()
        else ...[
          if (headerBadgeVisible)
            Padding(
              key: _hasSearchQuery ? headerBadgeAnchor : null,
              padding: const EdgeInsets.only(bottom: 16),
              child: _buildHighlightedText(
                headerBadge,
                TextStyle(
                  color: context.aublColors.cobalt,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ...chapterWidgets,
          if (filteredHostOrderEntries.isNotEmpty) ...[
            const SizedBox(height: 12),
            KeyedSubtree(
              key: _hasSearchQuery ? hostOrderAnchor : null,
              child: _buildHostOrderSection(filteredHostOrderEntries),
            ),
          ],
          if (appendixVisible) ...[
            const SizedBox(height: 12),
            KeyedSubtree(
              key: _hasSearchQuery ? appendixAnchor : null,
              child: _buildAppendixSection(appendixText),
            ),
          ],
        ],
      ],
    );
    return _RulesListBuildResult(
      listView: listView,
      resultAnchors: resultAnchors,
    );
  }

  _RulesListBuildResult _buildDefaultChapters() {
    final hostOrderEntries = defaultRuleHostOrder.asMap().entries.toList(
      growable: false,
    );
    final filteredHostOrderEntries = _hasSearchQuery
        ? hostOrderEntries
              .where((entry) => _matchesQueryInFields([entry.value]))
              .toList(growable: false)
        : hostOrderEntries;
    final appendixVisible =
        !_hasSearchQuery || _matchesQueryInFields([defaultRuleAppendixText]);

    final chapterWidgets = <Widget>[];
    final resultAnchors = <GlobalKey>[];
    for (final chapter in defaultRuleChapters) {
      final accentColor = context.aublColors.cobalt;
      final chapterTitleMatched = _matchesQueryInFields([chapter.title]);
      final visibleArticles = (!_hasSearchQuery || chapterTitleMatched)
          ? chapter.articles
          : chapter.articles
                .where(
                  (article) =>
                      _matchesQueryInFields([article.title, ...article.body]),
                )
                .toList();

      if (_hasSearchQuery && !chapterTitleMatched && visibleArticles.isEmpty) {
        continue;
      }

      final chapterAnchor = GlobalKey();
      if (_hasSearchQuery) {
        resultAnchors.add(chapterAnchor);
      }
      chapterWidgets.add(
        Container(
          key: _hasSearchQuery ? chapterAnchor : null,
          margin: const EdgeInsets.only(bottom: 8),
          decoration: BoxDecoration(
            color: context.aublColors.surface,
            borderRadius: BorderRadius.circular(4),
            border: Border.all(color: context.aublColors.line),
          ),
          child: ExpansionTile(
            key: PageStorageKey('default-${chapter.title}'),
            initiallyExpanded: _hasSearchQuery,
            title: _buildHighlightedText(
              chapter.title,
              TextStyle(
                color: context.aublColors.ink,
                fontWeight: FontWeight.w500,
              ),
            ),
            childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            children: visibleArticles.map((article) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildHighlightedText(
                      article.title,
                      TextStyle(
                        color: accentColor,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    ...article.body.map((line) {
                      if (line.isEmpty) {
                        return const SizedBox(height: 6);
                      }
                      return Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: _buildHighlightedText(
                          line,
                          TextStyle(
                            color: context.aublColors.ink,
                            fontSize: 13,
                            height: 1.5,
                          ),
                        ),
                      );
                    }),
                  ],
                ),
              );
            }).toList(),
          ),
        ),
      );
    }

    final hostOrderAnchor = GlobalKey();
    if (_hasSearchQuery && filteredHostOrderEntries.isNotEmpty) {
      resultAnchors.add(hostOrderAnchor);
    }

    final appendixAnchor = GlobalKey();
    if (_hasSearchQuery && appendixVisible) {
      resultAnchors.add(appendixAnchor);
    }

    final resultCount = resultAnchors.length;
    final hasResult = resultCount > 0;

    final listView = ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (_hasSearchQuery) _buildSearchSummary(resultCount),
        if (_hasSearchQuery && !hasResult)
          _buildNoResultCard()
        else ...[
          ...chapterWidgets,
          if (filteredHostOrderEntries.isNotEmpty) ...[
            const SizedBox(height: 12),
            KeyedSubtree(
              key: _hasSearchQuery ? hostOrderAnchor : null,
              child: _buildHostOrderSection(filteredHostOrderEntries),
            ),
          ],
          if (appendixVisible) ...[
            const SizedBox(height: 12),
            KeyedSubtree(
              key: _hasSearchQuery ? appendixAnchor : null,
              child: _buildAppendixSection(defaultRuleAppendixText),
            ),
          ],
        ],
      ],
    );
    return _RulesListBuildResult(
      listView: listView,
      resultAnchors: resultAnchors,
    );
  }
}

class _SearchResultButton extends StatelessWidget {
  const _SearchResultButton({
    required this.tooltip,
    required this.icon,
    required this.onPressed,
  });

  final String tooltip;
  final IconData icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return SizedBox.square(
      dimension: 44,
      child: IconButton.outlined(
        tooltip: tooltip,
        onPressed: onPressed,
        icon: Icon(icon, size: 20),
        color: colors.ink,
        disabledColor: colors.lineStrong,
        style: IconButton.styleFrom(
          padding: EdgeInsets.zero,
          side: BorderSide(color: colors.line),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
        ),
      ),
    );
  }
}

class _RulesListBuildResult {
  _RulesListBuildResult({required this.listView, required this.resultAnchors});

  final Widget listView;
  final List<GlobalKey> resultAnchors;
}
