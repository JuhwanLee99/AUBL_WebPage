import 'package:flutter/material.dart';

typedef GroupLetter = String;

class TeamGroupEntry {
  const TeamGroupEntry({required this.name, required this.group});
  final String name;
  final GroupLetter group;
}

const List<TeamGroupEntry> teamGroups = [
  TeamGroupEntry(name: '가천 WIND', group: 'A'),
  TeamGroupEntry(name: '가톨릭대학교 텀블러즈', group: 'A'),
  TeamGroupEntry(name: '강남대학교 타키온즈', group: 'A'),
  TeamGroupEntry(name: '건국대 팬서스', group: 'A'),
  TeamGroupEntry(name: '건국대(서울) 불소야구', group: 'A'),
  TeamGroupEntry(name: '경기대학교 KGB', group: 'B'),
  TeamGroupEntry(name: '경희대국제 LIONS', group: 'B'),
  TeamGroupEntry(name: '경희대학교(서울) BRAVES', group: 'B'),
  TeamGroupEntry(name: '고려대학교 백구회', group: 'B'),
  TeamGroupEntry(name: '광운대학교 페가수스', group: 'B'),
  TeamGroupEntry(name: '국민대학교 윈드밀스', group: 'C'),
  TeamGroupEntry(name: '단국대 PANDAS', group: 'C'),
  TeamGroupEntry(name: '단국대학교 하운드', group: 'C'),
  TeamGroupEntry(name: '동국대학교 LAE', group: 'C'),
  TeamGroupEntry(name: '명지대학교(서울) 나이너스', group: 'C'),
  TeamGroupEntry(name: '백석대학교 칼로스', group: 'D'),
  TeamGroupEntry(name: '상명대BUCKS', group: 'D'),
  TeamGroupEntry(name: '서강대학교 야구반 알바트로스', group: 'D'),
  TeamGroupEntry(name: '서경대학교 적시타', group: 'D'),
  TeamGroupEntry(name: '서울과학기술대 미르', group: 'D'),
  TeamGroupEntry(name: '서울시립대학교FALCONS', group: 'E'),
  TeamGroupEntry(name: '성균관대학교 킹고야구반', group: 'E'),
  TeamGroupEntry(name: '세종대학교 세종킹스', group: 'E'),
  TeamGroupEntry(name: '숭실대학교 oners', group: 'E'),
  TeamGroupEntry(name: '아주대학교 ABBA', group: 'E'),
  TeamGroupEntry(name: '연세대학교 EAGLES', group: 'F'),
  TeamGroupEntry(name: '외대(글로벌) 유니온', group: 'F'),
  TeamGroupEntry(name: '인천대학교 바이킹', group: 'F'),
  TeamGroupEntry(name: '인하대학교 비룡', group: 'F'),
  TeamGroupEntry(name: '중앙대학교 랑데뷰', group: 'F'),
  TeamGroupEntry(name: '한국공학대학교 WINNERS', group: 'G'),
  TeamGroupEntry(name: '한국교통대학교 스윙스', group: 'G'),
  TeamGroupEntry(name: '한국외대(서울) 야구부', group: 'G'),
  TeamGroupEntry(name: '한국체대 루나틱스', group: 'G'),
  TeamGroupEntry(name: '한국항공대 Astros', group: 'G'),
  TeamGroupEntry(name: '한성대학교 TURTLES', group: 'H'),
  TeamGroupEntry(name: '한신대학교 갱스터', group: 'H'),
  TeamGroupEntry(name: '한양대ERICA HIBA', group: 'H'),
  TeamGroupEntry(name: '한양대학교 불새', group: 'H'),
  TeamGroupEntry(name: '홍익대학교 위너스', group: 'H'),
];

const List<String> groupLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const Map<String, Color> groupColors = {
  'A': Color(0xFF60A5FA),
  'B': Color(0xFFA855F7),
  'C': Color(0xFF34D399),
  'D': Color(0xFFF97316),
  'E': Color(0xFFF43F5E),
  'F': Color(0xFFFACC15),
  'G': Color(0xFF38BDF8),
  'H': Color(0xFFFB923C),
};

/// 팀명 → 조 빠른 검색
final Map<String, String> teamNameToGroup = {
  for (final t in teamGroups) t.name: t.group,
};
