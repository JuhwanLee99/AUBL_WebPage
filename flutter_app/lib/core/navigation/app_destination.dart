enum AppDestination {
  home,
  teams,
  games,
  records,
  community,
  more;

  String get label => switch (this) {
        home => '홈',
        teams => '팀',
        games => '경기',
        records => '기록',
        community => '커뮤니티',
        more => '더보기',
      };
}
