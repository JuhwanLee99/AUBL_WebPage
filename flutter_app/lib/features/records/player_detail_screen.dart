import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/services/backend_api_service.dart';
import '../../core/theme/app_theme.dart';

class PlayerDetailScreen extends StatefulWidget {
  const PlayerDetailScreen({
    super.key,
    this.initialPlayerId,
    this.initialSeasonId,
    this.apiService,
    this.embedded = false,
  });

  final int? initialPlayerId;
  final int? initialSeasonId;
  final BackendApiService? apiService;
  final bool embedded;

  @override
  State<PlayerDetailScreen> createState() => _PlayerDetailScreenState();
}

class _PlayerDetailScreenState extends State<PlayerDetailScreen> {
  late final BackendApiService _api;
  late final bool _ownsApi;

  List<SeasonSummary> _seasons = [];
  int? _searchSeasonId;
  int? _viewSeasonId;

  List<PlayerLookup> _searchCandidates = [];
  List<SeasonTeam> _seasonTeams = [];
  bool _searchIndexLoading = false;
  String? _searchIndexError;
  Timer? _searchDebounceTimer;
  int _searchRequestSeq = 0;

  String _selectedTeamName = 'ALL';
  String _searchInput = '';
  String _selectedPlayerInput = '';

  int? _currentPlayerId;
  PlayerStatsResponse? _stats;
  int? _selectedBatterSeasonId;
  int? _selectedPitcherSeasonId;

  List<BatterGameLog> _batterGameLogs = [];
  List<PitcherGameLog> _pitcherGameLogs = [];
  bool _gameLogsLoading = false;
  String? _gameLogsError;
  String _gameIdInput = '';
  int? _selectedGameId;

  final List<_VisitedPlayer> _visitedPlayers = [];

  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _api = widget.apiService ?? BackendApiService();
    _ownsApi = widget.apiService == null;
    _currentPlayerId = widget.initialPlayerId;
    _selectedPlayerInput =
        widget.initialPlayerId != null ? '${widget.initialPlayerId}' : '';
    _loadSeasons();
    if (_currentPlayerId != null) {
      _loadPlayer(_currentPlayerId!);
    }
  }

  @override
  void dispose() {
    _searchDebounceTimer?.cancel();
    if (_ownsApi) {
      _api.dispose();
    }
    super.dispose();
  }

  Future<void> _loadSeasons() async {
    try {
      final seasons = await _api.getSeasons();
      if (!mounted) return;
      setState(() {
        _seasons = seasons;
        if (seasons.isNotEmpty) {
          _searchSeasonId = widget.initialSeasonId ?? seasons.first.id;
          _viewSeasonId ??= widget.initialSeasonId;
        }
      });
      if (_searchSeasonId != null) {
        await _loadSeasonTeams();
        _schedulePlayerSearch();
      }
    } catch (err) {
      if (!mounted) return;
      setState(() {
        _searchIndexError = err.toString();
      });
    }
  }

  Future<void> _loadSeasonTeams() async {
    final seasonId = _searchSeasonId;
    if (seasonId == null) return;
    try {
      final teams = await _api.getSeasonTeams(seasonId);
      if (!mounted) return;
      setState(() {
        _seasonTeams = teams;
        if (_selectedTeamName != 'ALL' &&
            !_teamOptions.contains(_selectedTeamName)) {
          _selectedTeamName = 'ALL';
        }
      });
    } catch (err) {
      if (!mounted) return;
      setState(() {
        _seasonTeams = [];
        _selectedTeamName = 'ALL';
        _searchIndexError = '시즌 팀 목록을 불러오지 못했습니다: $err';
      });
    }
  }

  int? get _selectedTeamId {
    if (_selectedTeamName == 'ALL') return null;
    final selectedKey = _normalizeKeyword(_selectedTeamName);
    for (final team in _seasonTeams) {
      if (_normalizeKeyword(team.teamName) == selectedKey) {
        return team.teamId;
      }
    }
    return null;
  }

  void _schedulePlayerSearch() {
    _searchDebounceTimer?.cancel();
    _searchDebounceTimer =
        Timer(const Duration(milliseconds: 300), _performPlayerSearch);
  }

  Future<void> _performPlayerSearch() async {
    final seasonId = _searchSeasonId;
    final keyword = _searchInput.trim();
    if (seasonId == null) return;

    if (keyword.isEmpty) {
      if (!mounted) return;
      setState(() {
        _searchCandidates = [];
        _searchIndexLoading = false;
        _searchIndexError = null;
      });
      return;
    }

    final seq = ++_searchRequestSeq;
    setState(() {
      _searchIndexLoading = true;
      _searchIndexError = null;
    });

    try {
      final items = await _api.searchPlayers(
        seasonId: seasonId,
        q: keyword,
        teamId: _selectedTeamId,
        limit: 50,
      );
      if (!mounted || seq != _searchRequestSeq) return;
      setState(() {
        _searchCandidates = items
            .map(
              (item) => PlayerLookup(
                playerId: item.playerId,
                playerName: item.playerName,
                teamName: item.teamName,
                jerseyNumber: item.jerseyNumber,
                seasonId: item.seasonId,
                seasonYear: null,
              ),
            )
            .toList();
        _searchIndexLoading = false;
      });
    } catch (err) {
      if (!mounted || seq != _searchRequestSeq) return;
      setState(() {
        _searchCandidates = [];
        _searchIndexLoading = false;
        _searchIndexError = err.toString();
      });
    }
  }

  Future<void> _loadPlayer(int playerId) async {
    setState(() {
      _loading = true;
      _error = null;
      _currentPlayerId = playerId;
      _selectedPlayerInput = '$playerId';
    });

    try {
      var stats = await _api.getPlayerStats(playerId, seasonId: _viewSeasonId);
      if (stats.teamName.trim().isEmpty || stats.jerseyNumber.trim().isEmpty) {
        try {
          final profile =
              await _api.getPlayerProfile(playerId, seasonId: _viewSeasonId);
          if (profile != null) {
            stats = PlayerStatsResponse(
              playerId: stats.playerId,
              playerName: stats.playerName.trim().isNotEmpty
                  ? stats.playerName
                  : profile.playerName,
              teamName: stats.teamName.trim().isNotEmpty
                  ? stats.teamName
                  : profile.teamName,
              jerseyNumber: stats.jerseyNumber.trim().isNotEmpty
                  ? stats.jerseyNumber
                  : profile.jerseyNumber,
              batterStats: stats.batterStats,
              pitcherStats: stats.pitcherStats,
            );
          }
        } catch (_) {
          // Ignore profile fallback error and keep stats response.
        }
      }
      if (!mounted) return;

      final batterSeasonIds = stats.batterStats
          .map((e) => e.seasonId)
          .toSet()
          .toList()
        ..sort((a, b) => b.compareTo(a));
      final pitcherSeasonIds = stats.pitcherStats
          .map((e) => e.seasonId)
          .toSet()
          .toList()
        ..sort((a, b) => b.compareTo(a));

      setState(() {
        _stats = stats;
        _loading = false;
        _selectedBatterSeasonId =
            batterSeasonIds.contains(_selectedBatterSeasonId)
                ? _selectedBatterSeasonId
                : (batterSeasonIds.isEmpty ? null : batterSeasonIds.first);
        _selectedPitcherSeasonId =
            pitcherSeasonIds.contains(_selectedPitcherSeasonId)
                ? _selectedPitcherSeasonId
                : (pitcherSeasonIds.isEmpty
                    ? (batterSeasonIds.isEmpty ? null : batterSeasonIds.first)
                    : pitcherSeasonIds.first);
      });

      _addVisitedPlayer(stats);
      await _loadGameLogs();
    } catch (err) {
      if (!mounted) return;
      setState(() {
        _stats = null;
        _loading = false;
        _error = err.toString();
      });
    }
  }

  Future<void> _loadGameLogs() async {
    final playerId = _currentPlayerId;
    if (playerId == null) return;

    setState(() {
      _gameLogsLoading = true;
      _gameLogsError = null;
    });

    try {
      final payload =
          await _api.getPlayerGameLogs(playerId, gameId: _selectedGameId);
      if (!mounted) return;
      final batter = [...payload.batterLogs]
        ..sort((a, b) => b.gameId.compareTo(a.gameId));
      final pitcher = [...payload.pitcherLogs]
        ..sort((a, b) => b.gameId.compareTo(a.gameId));

      setState(() {
        _batterGameLogs = batter;
        _pitcherGameLogs = pitcher;
        _gameLogsLoading = false;
      });
    } catch (err) {
      if (!mounted) return;
      setState(() {
        _batterGameLogs = [];
        _pitcherGameLogs = [];
        _gameLogsLoading = false;
        _gameLogsError = err.toString();
      });
    }
  }

  void _addVisitedPlayer(PlayerStatsResponse stats) {
    final item = _VisitedPlayer(
      playerId: stats.playerId,
      playerName: stats.playerName,
      teamName: stats.teamName,
      jerseyNumber: stats.jerseyNumber,
    );
    _visitedPlayers.removeWhere((e) => e.playerId == item.playerId);
    _visitedPlayers.insert(0, item);
    if (_visitedPlayers.length > 20) {
      _visitedPlayers.removeRange(20, _visitedPlayers.length);
    }
  }

  void _handleNameSearch() {
    final term = _normalizeKeyword(_searchInput);
    if (term.isEmpty) {
      setState(() => _error = '검색어를 입력해 주세요.');
      return;
    }

    final candidates = _nameFilteredCandidates;
    if (candidates.isEmpty) {
      setState(() => _error = '입력한 이름으로 선수를 찾지 못했습니다.');
      return;
    }

    final exactName = candidates
        .where((item) => _normalizeKeyword(item.playerName) == term)
        .toList();
    if (exactName.length == 1) {
      _navigateToPlayer(exactName.first.playerId);
      return;
    }

    final exactComposite = candidates.where((item) {
      final composite = _normalizeKeyword(
          '${item.playerName} ${item.teamName} ${item.jerseyNumber}');
      return composite == term;
    }).toList();

    if (exactComposite.length == 1) {
      _navigateToPlayer(exactComposite.first.playerId);
      return;
    }

    if (candidates.length == 1) {
      _navigateToPlayer(candidates.first.playerId);
      return;
    }

    setState(() {
      _error = '동일 이름 선수가 여러 명입니다. 팀 선수 목록에서 선택해 주세요.';
    });
  }

  void _handleIdSearch() {
    final id = int.tryParse(_selectedPlayerInput.trim());
    if (id == null || id <= 0) {
      setState(() => _error = '선수 ID는 1 이상의 정수여야 합니다.');
      return;
    }
    _navigateToPlayer(id);
  }

  void _navigateToPlayer(int playerId) {
    setState(() {
      _error = null;
      _searchInput = _searchCandidates
          .firstWhere((e) => e.playerId == playerId,
              orElse: () => PlayerLookup(
                    playerId: playerId,
                    playerName: '',
                    teamName: '',
                    jerseyNumber: '',
                    seasonId: _searchSeasonId ?? 0,
                    seasonYear: null,
                  ))
          .playerName;
    });
    _loadPlayer(playerId);
  }

  void _applyGameId() {
    final input = _gameIdInput.trim();
    if (input.isEmpty) {
      setState(() {
        _selectedGameId = null;
      });
      _loadGameLogs();
      return;
    }

    final gameId = int.tryParse(input);
    if (gameId == null || gameId <= 0) {
      setState(() => _gameLogsError = 'Game ID는 1 이상의 정수여야 합니다.');
      return;
    }

    setState(() {
      _selectedGameId = gameId;
    });
    _loadGameLogs();
  }

  String _normalizeKeyword(String value) {
    return value.replaceAll(RegExp(r'\s+'), '').toLowerCase();
  }

  List<String> get _teamOptions {
    final source = _seasonTeams
        .map((e) => e.teamName)
        .where((e) => e.trim().isNotEmpty)
        .toSet()
        .toList();
    source.sort((a, b) => a.compareTo(b));
    return source;
  }

  List<PlayerLookup> get _teamFilteredCandidates {
    if (_selectedTeamName == 'ALL') return _searchCandidates;
    final key = _normalizeKeyword(_selectedTeamName);
    return _searchCandidates
        .where((item) => _normalizeKeyword(item.teamName) == key)
        .toList();
  }

  List<PlayerLookup> get _nameFilteredCandidates {
    final term = _normalizeKeyword(_searchInput);
    if (term.isEmpty) return _teamFilteredCandidates;
    return _teamFilteredCandidates.where((item) {
      final composite = _normalizeKeyword(
          '${item.playerName} ${item.teamName} ${item.jerseyNumber}');
      return composite.contains(term);
    }).toList();
  }

  String _formatSeasonLabel(int? seasonId) {
    if (seasonId == null) return '-';
    final season = _seasons.firstWhere((e) => e.id == seasonId,
        orElse: () => SeasonSummary(id: seasonId, year: seasonId));
    return '${season.year} 시즌';
  }

  BatterStatSummary? get _selectedBatterStat {
    final stats = _stats;
    if (stats == null || stats.batterStats.isEmpty) return null;
    if (_selectedBatterSeasonId == null) return stats.batterStats.first;
    return stats.batterStats.firstWhere(
      (item) => item.seasonId == _selectedBatterSeasonId,
      orElse: () => stats.batterStats.first,
    );
  }

  PitcherStatSummary? get _selectedPitcherStat {
    final stats = _stats;
    if (stats == null || stats.pitcherStats.isEmpty) return null;
    if (_selectedPitcherSeasonId == null) return stats.pitcherStats.first;
    return stats.pitcherStats.firstWhere(
      (item) => item.seasonId == _selectedPitcherSeasonId,
      orElse: () => stats.pitcherStats.first,
    );
  }

  @override
  Widget build(BuildContext context) {
    final content = RefreshIndicator(
      onRefresh: () async {
        await _loadSeasonTeams();
        await _performPlayerSearch();
        if (_currentPlayerId != null) {
          await _loadPlayer(_currentPlayerId!);
        }
      },
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          _buildSearchCard(),
          const SizedBox(height: 10),
          _buildPlayerSummaryCard(),
          const SizedBox(height: 10),
          _buildGameLogCard(),
          const SizedBox(height: 24),
        ],
      ),
    );

    if (widget.embedded) {
      return content;
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('선수 상세'),
        actions: [
          IconButton(
            onPressed: _loadSeasons,
            icon: const Icon(Icons.refresh),
            tooltip: '새로고침',
          ),
        ],
      ),
      body: content,
    );
  }

  Widget _buildSearchCard() {
    final colors = context.aublColors;
    final teamFilterValues = <String>['ALL', ..._teamOptions];
    final teamFilterItems = teamFilterValues
        .map(
          (team) => DropdownMenuItem<String>(
            value: team,
            child: Text(
              team == 'ALL' ? '전체 팀' : team,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        )
        .toList();

    final rosterItems = _teamFilteredCandidates
        .map(
          (item) => DropdownMenuItem<int>(
            value: item.playerId,
            child: Text(
              '${item.playerName} (${item.teamName} #${item.jerseyNumber})',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        )
        .toList();

    return _Card(
      title: '선수 검색',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          LayoutBuilder(
            builder: (context, constraints) {
              final fieldWidth = constraints.maxWidth < 520
                  ? constraints.maxWidth
                  : (constraints.maxWidth - 8) / 2;
              return Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  SizedBox(
                    width: fieldWidth,
                    child: DropdownButtonFormField<int>(
                      key: ValueKey<Object?>('search-season-$_searchSeasonId'),
                      initialValue: _searchSeasonId,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: '검색 기준 시즌'),
                      items: _seasons
                          .map((season) => DropdownMenuItem<int>(
                                value: season.id,
                                child: Text(
                                  '${season.year} 시즌',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ))
                          .toList(),
                      onChanged: (value) {
                        if (value == null || value == _searchSeasonId) return;
                        setState(() {
                          _searchSeasonId = value;
                          _searchCandidates = [];
                          _selectedTeamName = 'ALL';
                        });
                        _loadSeasonTeams().then((_) => _schedulePlayerSearch());
                      },
                    ),
                  ),
                  SizedBox(
                    width: fieldWidth,
                    child: DropdownButtonFormField<String>(
                      key: ValueKey<String>('team-filter-$_selectedTeamName'),
                      initialValue: _selectedTeamName,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: '팀 필터'),
                      items: teamFilterItems,
                      selectedItemBuilder: (context) {
                        return teamFilterValues
                            .map(
                              (team) => Align(
                                alignment: Alignment.centerLeft,
                                child: Text(
                                  team == 'ALL' ? '전체 팀' : team,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            )
                            .toList();
                      },
                      onChanged: (value) {
                        if (value == null) return;
                        setState(() => _selectedTeamName = value);
                        _schedulePlayerSearch();
                      },
                    ),
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: 8),
          LayoutBuilder(
            builder: (context, constraints) => Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                SizedBox(
                  width: constraints.maxWidth < 480
                      ? constraints.maxWidth
                      : constraints.maxWidth - 116,
                  child: TextField(
                    onChanged: (value) {
                      setState(() => _searchInput = value);
                      _schedulePlayerSearch();
                    },
                    decoration: const InputDecoration(
                      labelText: '선수 이름 검색',
                      hintText: '예: 홍길동',
                      prefixIcon: Icon(Icons.search),
                    ),
                  ),
                ),
                SizedBox(
                  width:
                      constraints.maxWidth < 480 ? constraints.maxWidth : 108,
                  child: FilledButton(
                    onPressed: _handleNameSearch,
                    child: const Text('이름 조회'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          LayoutBuilder(
            builder: (context, constraints) => Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                SizedBox(
                  width: constraints.maxWidth < 620
                      ? constraints.maxWidth
                      : constraints.maxWidth - 250,
                  child: DropdownButtonFormField<int>(
                    key: ValueKey<String>(
                        'team-roster-${_searchSeasonId ?? 0}-$_selectedTeamName-${_teamFilteredCandidates.length}'),
                    initialValue: null,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: '팀 선수 목록'),
                    hint: Text(
                      _teamFilteredCandidates.isEmpty ? '선수 목록 없음' : '선수 선택',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    items: rosterItems,
                    selectedItemBuilder: (context) {
                      return _teamFilteredCandidates
                          .map(
                            (item) => Align(
                              alignment: Alignment.centerLeft,
                              child: Text(
                                '${item.playerName} (${item.teamName} #${item.jerseyNumber})',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          )
                          .toList();
                    },
                    onChanged: (value) {
                      if (value == null) return;
                      _navigateToPlayer(value);
                    },
                  ),
                ),
                SizedBox(
                  width: constraints.maxWidth < 620
                      ? (constraints.maxWidth - 8) / 2
                      : 116,
                  child: TextField(
                    onChanged: (value) => _selectedPlayerInput = value,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: '선수 ID'),
                  ),
                ),
                SizedBox(
                  width: constraints.maxWidth < 620
                      ? (constraints.maxWidth - 8) / 2
                      : 118,
                  child: OutlinedButton(
                    onPressed: _handleIdSearch,
                    child: const Text('ID 조회'),
                  ),
                ),
              ],
            ),
          ),
          if (_searchIndexLoading)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('선수 검색 결과를 불러오는 중...',
                  style: TextStyle(color: colors.muted, fontSize: 12)),
            ),
          if (_searchIndexError != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('검색 오류: $_searchIndexError',
                  style: TextStyle(color: colors.danger, fontSize: 12)),
            ),
          if (_nameFilteredCandidates.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: _nameFilteredCandidates.take(12).map((item) {
                return ActionChip(
                  label: Text(
                      '${item.playerName} · ${item.teamName}${item.jerseyNumber.isEmpty ? '' : ' #${item.jerseyNumber}'}'),
                  onPressed: () => _navigateToPlayer(item.playerId),
                );
              }).toList(),
            ),
          ],
          if (_visitedPlayers.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text('최근 조회', style: TextStyle(color: colors.muted, fontSize: 12)),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: _visitedPlayers.take(12).map((item) {
                return ActionChip(
                  label: Text(
                      '${item.playerName} · ${item.teamName}${item.jerseyNumber.isEmpty ? '' : ' #${item.jerseyNumber}'}'),
                  onPressed: () => _navigateToPlayer(item.playerId),
                );
              }).toList(),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildPlayerSummaryCard() {
    final colors = context.aublColors;
    if (_loading) {
      return const _Card(
          title: '선수 요약', child: Center(child: CircularProgressIndicator()));
    }

    if (_error != null) {
      return _Card(
        title: '선수 요약',
        child: Text('오류: $_error', style: TextStyle(color: colors.danger)),
      );
    }

    if (_currentPlayerId == null || _stats == null) {
      return _Card(
        title: '선수 요약',
        child: Text('팀/이름/ID로 조회할 선수를 먼저 선택해 주세요.',
            style: TextStyle(color: colors.muted)),
      );
    }

    final stats = _stats!;
    final batterSeasonIds = stats.batterStats
        .map((e) => e.seasonId)
        .toSet()
        .toList()
      ..sort((a, b) => b.compareTo(a));
    final pitcherSeasonIds = stats.pitcherStats
        .map((e) => e.seasonId)
        .toSet()
        .toList()
      ..sort((a, b) => b.compareTo(a));

    return _Card(
      title: '선수 요약',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.person_outline_rounded, color: colors.cobalt),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '${stats.playerName} ${stats.jerseyNumber.isEmpty ? '' : '#${stats.jerseyNumber}'}',
                  style: TextStyle(
                      color: colors.ink,
                      fontSize: 18,
                      fontWeight: FontWeight.w800),
                ),
              ),
              Text('ID ${stats.playerId}',
                  style: TextStyle(color: colors.muted)),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            stats.teamName.isEmpty ? '-' : stats.teamName,
            style: TextStyle(color: colors.muted),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<int>(
                  key: ValueKey<Object?>(
                      'view-season-${_viewSeasonId ?? 'all'}'),
                  initialValue: _viewSeasonId,
                  decoration: const InputDecoration(labelText: '기록 조회 시즌(선택)'),
                  items: [
                    const DropdownMenuItem<int>(value: null, child: Text('전체')),
                    ..._seasons.map(
                      (season) => DropdownMenuItem<int>(
                        value: season.id,
                        child: Text('${season.year} 시즌'),
                      ),
                    ),
                  ],
                  onChanged: (value) {
                    setState(() => _viewSeasonId = value);
                    if (_currentPlayerId != null) {
                      _loadPlayer(_currentPlayerId!);
                    }
                  },
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (batterSeasonIds.isNotEmpty)
            DropdownButtonFormField<int>(
              key: ValueKey<Object?>(
                  'batter-season-${_selectedBatterSeasonId ?? 'none'}'),
              initialValue: _selectedBatterSeasonId,
              decoration: const InputDecoration(labelText: '타자 시즌 선택'),
              items: batterSeasonIds
                  .map((seasonId) => DropdownMenuItem<int>(
                      value: seasonId,
                      child: Text(_formatSeasonLabel(seasonId))))
                  .toList(),
              onChanged: (value) =>
                  setState(() => _selectedBatterSeasonId = value),
            ),
          if (pitcherSeasonIds.isNotEmpty) ...[
            const SizedBox(height: 8),
            DropdownButtonFormField<int>(
              key: ValueKey<Object?>(
                  'pitcher-season-${_selectedPitcherSeasonId ?? 'none'}'),
              initialValue: _selectedPitcherSeasonId,
              decoration: const InputDecoration(labelText: '투수 시즌 선택'),
              items: pitcherSeasonIds
                  .map((seasonId) => DropdownMenuItem<int>(
                      value: seasonId,
                      child: Text(_formatSeasonLabel(seasonId))))
                  .toList(),
              onChanged: (value) =>
                  setState(() => _selectedPitcherSeasonId = value),
            ),
          ],
          if (_selectedBatterStat != null) ...[
            const SizedBox(height: 12),
            _StatsPanel(
              title: '타자 기록 - ${_formatSeasonLabel(_selectedBatterSeasonId)}',
              stats: [
                _Stat('AVG',
                    _selectedBatterStat!.battingAverage.toStringAsFixed(3)),
                _Stat('OBP', _selectedBatterStat!.onBasePct.toStringAsFixed(3)),
                _Stat(
                    'SLG', _selectedBatterStat!.sluggingPct.toStringAsFixed(3)),
                _Stat('OPS', _selectedBatterStat!.ops.toStringAsFixed(3)),
                _Stat('HR', '${_selectedBatterStat!.homeRuns}'),
                _Stat('RBI', '${_selectedBatterStat!.runsBattedIn}'),
                _Stat('H', '${_selectedBatterStat!.hits}'),
                _Stat('SB', '${_selectedBatterStat!.stolenBases}'),
                _Stat('BB', '${_selectedBatterStat!.walks}'),
                _Stat('SO', '${_selectedBatterStat!.strikeouts}'),
                _Stat('G', '${_selectedBatterStat!.gamesPlayed}'),
                _Stat('AB', '${_selectedBatterStat!.atBats}'),
              ],
            ),
          ],
          if (_selectedPitcherStat != null) ...[
            const SizedBox(height: 12),
            _StatsPanel(
              title: '투수 기록 - ${_formatSeasonLabel(_selectedPitcherSeasonId)}',
              stats: [
                _Stat('ERA', _selectedPitcherStat!.era.toStringAsFixed(2)),
                _Stat('IP',
                    _selectedPitcherStat!.inningsPitched.toStringAsFixed(1)),
                _Stat('WHIP', _selectedPitcherStat!.whip.toStringAsFixed(2)),
                _Stat('K', '${_selectedPitcherStat!.strikeouts}'),
                _Stat('BB', '${_selectedPitcherStat!.walksAllowed}'),
                _Stat('W', '${_selectedPitcherStat!.wins}'),
                _Stat('L', '${_selectedPitcherStat!.losses}'),
                _Stat('SV', '${_selectedPitcherStat!.saves}'),
                _Stat('HLD', '${_selectedPitcherStat!.holds}'),
                _Stat('K/9', _selectedPitcherStat!.kPer9.toStringAsFixed(2)),
                _Stat('BB/9', _selectedPitcherStat!.bbPer9.toStringAsFixed(2)),
                _Stat('G', '${_selectedPitcherStat!.gamesPlayed}'),
              ],
            ),
          ],
          if (_selectedBatterStat == null && _selectedPitcherStat == null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('해당 선수의 시즌 기록이 없습니다.',
                  style: TextStyle(color: colors.muted)),
            ),
        ],
      ),
    );
  }

  Widget _buildGameLogCard() {
    final colors = context.aublColors;
    return _Card(
      title: '경기별 기록 (Player Logs)',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          LayoutBuilder(
            builder: (context, constraints) {
              final compact = constraints.maxWidth < 480;
              final inputWidth = compact ? constraints.maxWidth : 140.0;

              return Wrap(
                spacing: 8,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  SizedBox(
                    width: inputWidth,
                    child: TextField(
                      onChanged: (value) => _gameIdInput = value,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Game ID',
                        hintText: '비우면 전체',
                      ),
                    ),
                  ),
                  OutlinedButton(
                      onPressed: _applyGameId, child: const Text('적용')),
                  OutlinedButton(
                    onPressed: () {
                      setState(() {
                        _gameIdInput = '';
                        _selectedGameId = null;
                      });
                      _loadGameLogs();
                    },
                    child: const Text('초기화'),
                  ),
                  ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: constraints.maxWidth),
                    child: Text(
                      '현재 필터: ${_selectedGameId != null ? 'Game #$_selectedGameId' : '전체'}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: colors.muted, fontSize: 12),
                    ),
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: 10),
          if (_gameLogsLoading) const LinearProgressIndicator(minHeight: 1),
          if (_gameLogsError != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('오류: $_gameLogsError',
                  style: TextStyle(color: colors.danger, fontSize: 12)),
            ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _smallMetric('경기 수',
                  '${(_batterGameLogs.map((e) => e.gameId).toSet()..addAll(_pitcherGameLogs.map((e) => e.gameId).toSet())).length}'),
              _smallMetric('타자 로그', '${_batterGameLogs.length}'),
              _smallMetric('투수 로그', '${_pitcherGameLogs.length}'),
            ],
          ),
          const SizedBox(height: 10),
          _buildBatterLogsTable(),
          const SizedBox(height: 10),
          _buildPitcherLogsTable(),
        ],
      ),
    );
  }

  Widget _buildBatterLogsTable() {
    final colors = context.aublColors;
    if (_batterGameLogs.isEmpty) {
      return const _SubSection(
          title: '타자 경기 로그', child: _EmptyText('타자 경기 로그가 없습니다.'));
    }

    return _SubSection(
      title: '타자 경기 로그 (${_batterGameLogs.length})',
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: DataTable(
          headingRowColor: WidgetStateProperty.all(colors.surfaceMuted),
          border: TableBorder(horizontalInside: BorderSide(color: colors.line)),
          columns: const [
            DataColumn(label: Text('Game', style: _thStyle)),
            DataColumn(label: Text('팀', style: _thStyle)),
            DataColumn(label: Text('선수', style: _thStyle)),
            DataColumn(label: Text('POS', style: _thStyle)),
            DataColumn(label: Text('AB', style: _thStyle), numeric: true),
            DataColumn(label: Text('R', style: _thStyle), numeric: true),
            DataColumn(label: Text('H', style: _thStyle), numeric: true),
            DataColumn(label: Text('RBI', style: _thStyle), numeric: true),
            DataColumn(label: Text('BB', style: _thStyle), numeric: true),
            DataColumn(label: Text('SO', style: _thStyle), numeric: true),
          ],
          rows: _batterGameLogs.map((row) {
            return DataRow(cells: [
              DataCell(Text('${row.gameId}', style: _numStyle)),
              DataCell(Text(row.teamSide, style: _cellStyle)),
              DataCell(Text(
                  '${row.playerName}${row.jerseyNumber.isEmpty ? '' : ' #${row.jerseyNumber}'}',
                  style: _cellStyle)),
              DataCell(Text(row.playerPosition, style: _cellStyle)),
              DataCell(Text('${row.atBats}', style: _numStyle)),
              DataCell(Text('${row.runs}', style: _numStyle)),
              DataCell(Text('${row.hits}', style: _numStyle)),
              DataCell(Text('${row.rbi}', style: _numStyle)),
              DataCell(Text('${row.walks}', style: _numStyle)),
              DataCell(Text('${row.strikeouts}', style: _numStyle)),
            ]);
          }).toList(),
        ),
      ),
    );
  }

  Widget _buildPitcherLogsTable() {
    final colors = context.aublColors;
    if (_pitcherGameLogs.isEmpty) {
      return const _SubSection(
          title: '투수 경기 로그', child: _EmptyText('투수 경기 로그가 없습니다.'));
    }

    return _SubSection(
      title: '투수 경기 로그 (${_pitcherGameLogs.length})',
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: DataTable(
          headingRowColor: WidgetStateProperty.all(colors.surfaceMuted),
          border: TableBorder(horizontalInside: BorderSide(color: colors.line)),
          columns: const [
            DataColumn(label: Text('Game', style: _thStyle)),
            DataColumn(label: Text('팀', style: _thStyle)),
            DataColumn(label: Text('선수', style: _thStyle)),
            DataColumn(label: Text('POS', style: _thStyle)),
            DataColumn(label: Text('IP', style: _thStyle), numeric: true),
            DataColumn(label: Text('H', style: _thStyle), numeric: true),
            DataColumn(label: Text('R', style: _thStyle), numeric: true),
            DataColumn(label: Text('ER', style: _thStyle), numeric: true),
            DataColumn(label: Text('BB', style: _thStyle), numeric: true),
            DataColumn(label: Text('K', style: _thStyle), numeric: true),
          ],
          rows: _pitcherGameLogs.map((row) {
            return DataRow(cells: [
              DataCell(Text('${row.gameId}', style: _numStyle)),
              DataCell(Text(row.teamSide, style: _cellStyle)),
              DataCell(Text(
                  '${row.playerName}${row.jerseyNumber.isEmpty ? '' : ' #${row.jerseyNumber}'}',
                  style: _cellStyle)),
              DataCell(Text(row.playerPosition, style: _cellStyle)),
              DataCell(Text(row.inningsPitched.toStringAsFixed(1),
                  style: _numStyle)),
              DataCell(Text('${row.hitsAllowed}', style: _numStyle)),
              DataCell(Text('${row.runsAllowed}', style: _numStyle)),
              DataCell(Text('${row.earnedRuns}', style: _numStyle)),
              DataCell(Text('${row.walks}', style: _numStyle)),
              DataCell(Text('${row.strikeouts}', style: _numStyle)),
            ]);
          }).toList(),
        ),
      ),
    );
  }

  Widget _smallMetric(String label, String value) {
    final colors = context.aublColors;
    return SizedBox(
      width: 100,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: TextStyle(color: colors.muted, fontSize: 11)),
              const SizedBox(height: 2),
              Text(value,
                  style: TextStyle(
                      color: colors.navyStrong, fontWeight: FontWeight.w900)),
            ],
          ),
        ),
      ),
    );
  }
}

class _VisitedPlayer {
  const _VisitedPlayer({
    required this.playerId,
    required this.playerName,
    required this.teamName,
    required this.jerseyNumber,
  });

  final int playerId;
  final String playerName;
  final String teamName;
  final String jerseyNumber;
}

class _Card extends StatelessWidget {
  const _Card({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 10),
            child,
          ],
        ),
      ),
    );
  }
}

class _Stat {
  const _Stat(this.label, this.value);

  final String label;
  final String value;
}

class _StatsPanel extends StatelessWidget {
  const _StatsPanel({
    required this.title,
    required this.stats,
  });

  final String title;
  final List<_Stat> stats;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: colors.line),
        color: colors.surfaceMuted,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: TextStyle(color: colors.ink, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: stats
                .map(
                  (s) => Container(
                    width: 88,
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(8),
                      color: colors.surface,
                      border: Border.all(color: colors.line),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(s.label,
                            style:
                                TextStyle(color: colors.muted, fontSize: 11)),
                        const SizedBox(height: 2),
                        Text(s.value,
                            style: TextStyle(
                                color: colors.navyStrong,
                                fontWeight: FontWeight.w700)),
                      ],
                    ),
                  ),
                )
                .toList(),
          ),
        ],
      ),
    );
  }
}

class _SubSection extends StatelessWidget {
  const _SubSection({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: colors.line),
        color: colors.surfaceMuted,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: TextStyle(
                  color: colors.ink,
                  fontSize: 13,
                  fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          child,
        ],
      ),
    );
  }
}

class _EmptyText extends StatelessWidget {
  const _EmptyText(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Text(text, style: TextStyle(color: colors.muted, fontSize: 12)),
    );
  }
}

const _thStyle = TextStyle(fontSize: 12, fontWeight: FontWeight.w800);
const _cellStyle = TextStyle(fontSize: 12);
final _numStyle =
    _cellStyle.copyWith(fontFeatures: const [FontFeature.tabularFigures()]);
