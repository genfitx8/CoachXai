import type { FaultId } from '../types/swingFault';

/**
 * Curated YouTube coaching topics.
 *
 * The student app never asks an LLM for video links — a model that invents a
 * plausible-looking video id hands the student a dead page. Instead every
 * recommendation starts from one of the topics below: a coach-authored search
 * query per language that a real YouTube search resolves into real videos
 * (`server/src/services/youtube.ts`). When the backend has no YouTube key the
 * same query still works as a `youtube.com/results` deep link, so the feature
 * degrades to "open this search" instead of to nothing.
 *
 * A topic is picked for a student when the coach's own words match it:
 * `keywords` are matched against lesson next-actions/feedback, homework
 * titles and the student's recorded fault history, `faults` against the
 * deterministic fault ids from `services/faultDetectionService.ts`, and
 * `missPatterns` against `ClubProfile.missPattern`. Adding a topic means one
 * entry here — nothing else in the pipeline is topic-aware.
 */

export type TopicLang = 'ko' | 'en' | 'ja';

export type MissPattern = 'slice' | 'hook' | 'thin' | 'fat' | 'push' | 'pull';

export interface YouTubeTopic {
  id: string;
  /** Card headline, per language. */
  label: Record<TopicLang, string>;
  /** One-line "what this fixes", per language. */
  blurb: Record<TopicLang, string>;
  /** Search query handed to YouTube, per language. */
  query: Record<TopicLang, string>;
  /**
   * Lowercase, whitespace-free fragments matched against coach/AI text.
   * Korean fragments are written without spaces because the matcher strips
   * whitespace from both sides ("체중 이동" matches "체중이동").
   */
  keywords: string[];
  /** Deterministic swing faults this topic answers. */
  faults?: FaultId[];
  /** Ball-flight miss patterns this topic answers. */
  missPatterns?: MissPattern[];
}

export const YOUTUBE_TOPICS: YouTubeTopic[] = [
  {
    id: 'slice',
    label: { ko: '슬라이스 교정', en: 'Fixing your slice', ja: 'スライス修正' },
    blurb: {
      ko: '공이 오른쪽으로 휘는 아웃-인 궤도를 잡는 드릴',
      en: 'Drills for the out-to-in path behind a slice',
      ja: 'スライスの原因になるアウトイン軌道を直すドリル',
    },
    query: {
      ko: '골프 슬라이스 교정 드릴 레슨',
      en: 'golf slice fix drill lesson',
      ja: 'ゴルフ スライス 直す ドリル レッスン',
    },
    keywords: ['슬라이스', 'slice', '오른쪽으로휘', '아웃인', '아웃투인', '커트샷', '깎아치'],
    faults: ['excessive_out_to_in'],
    missPatterns: ['slice'],
  },
  {
    id: 'hook',
    label: { ko: '훅·감김 교정', en: 'Taming the hook', ja: 'フック修正' },
    blurb: {
      ko: '공이 왼쪽으로 감기는 인-아웃 과다를 줄이는 드릴',
      en: 'Drills for an over-rotated in-to-out path',
      ja: '左に巻くインアウト過多を抑えるドリル',
    },
    query: {
      ko: '골프 훅 교정 드릴 레슨',
      en: 'golf hook fix drill lesson',
      ja: 'ゴルフ フック 直す ドリル レッスン',
    },
    keywords: ['훅이', '훅교정', '훅이나', 'hook', '왼쪽으로감', '인아웃과다', '인투아웃'],
    faults: ['excessive_in_to_out'],
    missPatterns: ['hook', 'pull'],
  },
  {
    id: 'contact',
    label: { ko: '뒤땅·토핑 컨택', en: 'Fat and thin contact', ja: 'ダフリ・トップ' },
    blurb: {
      ko: '임팩트 최저점을 공 앞으로 옮기는 컨택 드릴',
      en: 'Moving the low point ahead of the ball',
      ja: '最下点をボールの前に移すコンタクトドリル',
    },
    query: {
      ko: '골프 뒤땅 토핑 교정 컨택 드릴',
      en: 'golf fat thin shot fix ball first contact drill',
      ja: 'ゴルフ ダフリ トップ 直す ドリル',
    },
    keywords: ['뒤땅', '토핑', '탑볼', '빗맞', '컨택', '다운블로', '뒤땅이', 'fatshot', 'thinshot'],
    missPatterns: ['fat', 'thin'],
  },
  {
    id: 'early_extension',
    label: { ko: '얼리 익스텐션(배치기)', en: 'Early extension', ja: 'アーリーエクステンション' },
    blurb: {
      ko: '임팩트에서 골반이 공 쪽으로 밀리는 습관 교정',
      en: 'Keeping the hips back through impact',
      ja: 'インパクトで腰が前に出る癖の修正',
    },
    query: {
      ko: '골프 얼리 익스텐션 배치기 교정 드릴',
      en: 'golf early extension fix drill',
      ja: 'ゴルフ アーリーエクステンション 修正 ドリル',
    },
    keywords: ['얼리익스텐션', '배치기', 'earlyextension', '골반이밀', '엉덩이가나', '상체가세워'],
    faults: ['early_extension', 'address_over_extension'],
  },
  {
    id: 'sway',
    label: { ko: '스웨이·헤드업', en: 'Sway and head lift', ja: 'スウェー・ヘッドアップ' },
    blurb: {
      ko: '스윙 중 머리와 중심이 좌우로 흔들리는 문제',
      en: 'Steadying the head and centre through the swing',
      ja: 'スイング中に頭と軸が左右へ動く問題',
    },
    query: {
      ko: '골프 스웨이 방지 머리 고정 드릴',
      en: 'golf sway fix keep head still drill',
      ja: 'ゴルフ スウェー 防止 頭 動かない ドリル',
    },
    keywords: ['스웨이', 'sway', '머리움직', '헤드업', '머리가들', '축이흔들', '좌우로밀'],
    faults: ['head_sway'],
  },
  {
    id: 'spine_angle',
    label: { ko: '척추 각 유지', en: 'Holding your spine angle', ja: '前傾角キープ' },
    blurb: {
      ko: '어드레스 전경 각도를 임팩트까지 지키는 훈련',
      en: 'Keeping the address tilt all the way to impact',
      ja: 'アドレスの前傾をインパクトまで保つ練習',
    },
    query: {
      ko: '골프 척추각 전경 유지 드릴',
      en: 'golf maintain spine angle posture drill',
      ja: 'ゴルフ 前傾角 キープ ドリル',
    },
    keywords: ['척추각', '전경', '상체각', '자세가무너', '리버스피벗', '역씨', '무릎각'],
    faults: ['spine_loss', 'reverse_spine', 'poor_knee_flex'],
  },
  {
    id: 'weight_shift',
    label: { ko: '체중이동', en: 'Weight shift', ja: '体重移動' },
    blurb: {
      ko: '백스윙 오른발 → 임팩트 왼발로 이어지는 압력 이동',
      en: 'Loading the trail side and clearing to the lead side',
      ja: 'バックスイングからインパクトへの圧力移動',
    },
    query: {
      ko: '골프 체중이동 하체 리드 드릴',
      en: 'golf weight shift lower body drill',
      ja: 'ゴルフ 体重移動 下半身 ドリル',
    },
    keywords: ['체중이동', '무게중심', '중심이동', '왼발로', '오른발에', 'weightshift', '압력이동'],
  },
  {
    id: 'rotation',
    label: { ko: '몸통 회전 · X팩터', en: 'Body rotation and X-factor', ja: '体幹の回転・Xファクター' },
    blurb: {
      ko: '상하체 분리와 어깨 회전량을 늘리는 훈련',
      en: 'More shoulder turn, better upper-lower separation',
      ja: '上下半身の分離と肩の回転量を増やす練習',
    },
    query: {
      ko: '골프 상하체 분리 어깨 회전 드릴',
      en: 'golf shoulder turn separation x-factor drill',
      ja: 'ゴルフ 肩の回転 上下分離 ドリル',
    },
    keywords: ['어깨회전', '몸통회전', '엑스팩터', 'x팩터', '상하체분리', '회전부족', '꼬임'],
    faults: ['weak_x_factor', 'weak_shoulder_turn'],
  },
  {
    id: 'tempo',
    label: { ko: '템포 · 리듬', en: 'Tempo and rhythm', ja: 'テンポ・リズム' },
    blurb: {
      ko: '급해지는 다운스윙을 3:1 리듬으로 되돌리는 훈련',
      en: 'Rebuilding a 3:1 backswing-to-downswing rhythm',
      ja: '急ぐダウンスイングを3:1のリズムに戻す練習',
    },
    query: {
      ko: '골프 스윙 템포 리듬 연습법',
      en: 'golf swing tempo rhythm drill 3 to 1',
      ja: 'ゴルフ スイング テンポ リズム 練習',
    },
    keywords: ['템포', '리듬', '급하게', '너무빨', '천천히스윙', 'tempo', '삼대일'],
    faults: ['quick_tempo', 'slow_tempo'],
  },
  {
    id: 'backswing',
    label: { ko: '백스윙 · 오버스윙', en: 'Backswing length', ja: 'バックスイング・オーバースイング' },
    blurb: {
      ko: '톱이 무너지지 않는 백스윙 크기 잡기',
      en: 'A top of swing you can actually control',
      ja: 'トップが崩れないバックスイングの大きさ',
    },
    query: {
      ko: '골프 오버스윙 백스윙 크기 교정 드릴',
      en: 'golf overswing backswing length fix drill',
      ja: 'ゴルフ オーバースイング バックスイング 修正 ドリル',
    },
    keywords: ['오버스윙', '백스윙이커', '백스윙크기', '톱에서', '팔로만', 'overswing'],
    faults: ['over_swing'],
  },
  {
    id: 'swing_plane',
    label: { ko: '스윙 플레인 · 궤도', en: 'Swing plane', ja: 'スイングプレーン' },
    blurb: {
      ko: '눕거나 서는 다운스윙 궤도를 제자리로',
      en: 'Getting a flat or steep downswing back on plane',
      ja: '寝る・立つダウンスイング軌道を整える',
    },
    query: {
      ko: '골프 스윙 플레인 다운스윙 궤도 드릴',
      en: 'golf swing plane downswing path drill',
      ja: 'ゴルフ スイングプレーン 軌道 ドリル',
    },
    keywords: ['스윙플레인', '궤도', '플레인', '클럽패스', '눕는다', '가파르게', '스티프'],
    faults: ['off_plane_flat', 'off_plane_steep'],
  },
  {
    id: 'sequence',
    label: { ko: '스윙 순서 · 하체 리드', en: 'Kinetic sequence', ja: 'スイングの順番' },
    blurb: {
      ko: '하체 → 상체 → 팔 순서로 힘이 전달되게',
      en: 'Lower body first, then torso, then arms',
      ja: '下半身→上体→腕の順に力を伝える',
    },
    query: {
      ko: '골프 다운스윙 순서 하체 리드 키네틱 시퀀스',
      en: 'golf kinetic sequence downswing lower body first drill',
      ja: 'ゴルフ ダウンスイング 順番 下半身リード ドリル',
    },
    keywords: ['하체리드', '스윙순서', '시퀀스', '다운스윙시작', '팔로먼저', '손으로먼저'],
    faults: ['inverted_kinetic_sequence', 'simultaneous_kinetic_peaks'],
  },
  {
    id: 'release',
    label: { ko: '코킹 · 릴리스', en: 'Wrist hinge and release', ja: 'コック・リリース' },
    blurb: {
      ko: '손목 각을 늦게 푸는 래깅과 릴리스 타이밍',
      en: 'Keeping lag, then releasing on time',
      ja: 'タメを保ちリリースのタイミングを合わせる',
    },
    query: {
      ko: '골프 손목 코킹 릴리스 캐스팅 교정 드릴',
      en: 'golf wrist hinge lag release casting fix drill',
      ja: 'ゴルフ 手首 コック タメ リリース ドリル',
    },
    keywords: ['코킹', '릴리스', '캐스팅', '손목각', '래깅', '레깅', '손목이풀'],
  },
  {
    id: 'grip',
    label: { ko: '그립', en: 'Grip', ja: 'グリップ' },
    blurb: {
      ko: '방향성과 손목 움직임을 좌우하는 잡는 법',
      en: 'The hold that decides face control',
      ja: '方向性を左右する握り方',
    },
    query: {
      ko: '골프 그립 잡는 법 기초 레슨',
      en: 'golf grip fundamentals lesson',
      ja: 'ゴルフ グリップ 握り方 基本 レッスン',
    },
    keywords: ['그립', 'grip', '스트롱그립', '위크그립', '손모양', '쥐는법'],
  },
  {
    id: 'setup',
    label: { ko: '어드레스 · 정렬', en: 'Setup and alignment', ja: 'アドレス・アライメント' },
    blurb: {
      ko: '스탠스, 볼 위치, 정렬을 다시 맞추는 기본',
      en: 'Stance, ball position and aim, reset',
      ja: 'スタンス・ボール位置・向きの再設定',
    },
    query: {
      ko: '골프 어드레스 자세 스탠스 정렬 기초',
      en: 'golf setup stance ball position alignment basics',
      ja: 'ゴルフ アドレス スタンス アライメント 基本',
    },
    keywords: ['어드레스', '셋업', '스탠스', '정렬', '얼라인먼트', '볼위치', '조준'],
  },
  {
    id: 'putting',
    label: { ko: '퍼팅', en: 'Putting', ja: 'パッティング' },
    blurb: {
      ko: '거리감과 스트로크를 다듬는 퍼팅 연습',
      en: 'Stroke and distance control on the green',
      ja: '距離感とストロークを磨くパッティング練習',
    },
    query: {
      ko: '골프 퍼팅 거리감 스트로크 연습법',
      en: 'golf putting stroke distance control drill',
      ja: 'ゴルフ パッティング 距離感 ストローク 練習',
    },
    keywords: ['퍼팅', '퍼터', '거리감', '그린에서', 'putt', '스트로크'],
  },
  {
    id: 'approach',
    label: { ko: '어프로치 · 숏게임', en: 'Chipping and pitching', ja: 'アプローチ' },
    blurb: {
      ko: '30~50m 거리감과 칩샷 컨택',
      en: 'Contact and distance inside 50 metres',
      ja: '30〜50ヤードの距離感とチップの接触',
    },
    query: {
      ko: '골프 어프로치 칩샷 거리감 연습법',
      en: 'golf chipping pitching distance control drill',
      ja: 'ゴルフ アプローチ チップショット 距離感 練習',
    },
    keywords: ['어프로치', '칩샷', '칩핑', '피치샷', '숏게임', '쇼트게임', '삼십미터', '오십미터'],
  },
  {
    id: 'bunker',
    label: { ko: '벙커 샷', en: 'Bunker play', ja: 'バンカーショット' },
    blurb: {
      ko: '모래를 때리는 벙커 탈출 기본기',
      en: 'Getting out of the sand, first time',
      ja: '砂を打つバンカー脱出の基本',
    },
    query: {
      ko: '골프 벙커샷 탈출 기초 레슨',
      en: 'golf bunker shot basics escape lesson',
      ja: 'ゴルフ バンカーショット 脱出 基本 レッスン',
    },
    keywords: ['벙커', '모래', 'bunker', '샌드웨지로'],
  },
  {
    id: 'driver',
    label: { ko: '드라이버 · 비거리', en: 'Driver distance', ja: 'ドライバー・飛距離' },
    blurb: {
      ko: '티샷 방향성과 비거리를 함께 잡는 연습',
      en: 'Tee shots that go far and stay in play',
      ja: 'ティーショットの方向性と飛距離',
    },
    query: {
      ko: '골프 드라이버 비거리 티샷 레슨',
      en: 'golf driver distance tee shot lesson',
      ja: 'ゴルフ ドライバー 飛距離 ティーショット レッスン',
    },
    keywords: ['드라이버', '티샷', '비거리', '장타', 'driver'],
  },
  {
    id: 'iron',
    label: { ko: '아이언 정확도', en: 'Iron accuracy', ja: 'アイアンの精度' },
    blurb: {
      ko: '아이언 컨택과 거리 편차 줄이기',
      en: 'Tighter iron contact and distance spread',
      ja: 'アイアンの接触と距離のばらつきを減らす',
    },
    query: {
      ko: '골프 아이언 정확도 컨택 레슨',
      en: 'golf iron accuracy ball striking lesson',
      ja: 'ゴルフ アイアン 精度 ボールコンタクト レッスン',
    },
    keywords: ['아이언', '칠번', '7번아이언', '아이언샷', '거리편차'],
  },
  {
    id: 'fitness',
    label: { ko: '유연성 · 근력', en: 'Golf fitness', ja: '柔軟性・筋力' },
    blurb: {
      ko: '회전 가동범위와 코어를 키우는 홈 트레이닝',
      en: 'Mobility and core work that supports the swing',
      ja: '回転の可動域とコアを鍛えるトレーニング',
    },
    query: {
      ko: '골프 유연성 스트레칭 코어 운동',
      en: 'golf mobility stretching core workout',
      ja: 'ゴルフ 柔軟性 ストレッチ 体幹 トレーニング',
    },
    keywords: ['유연성', '스트레칭', '근력', '코어', '체력', '가동범위', '허리통증'],
  },
  {
    id: 'course',
    label: { ko: '코스 매니지먼트 · 멘탈', en: 'Course management', ja: 'コースマネジメント' },
    blurb: {
      ko: '스코어를 지키는 클럽 선택과 마음가짐',
      en: 'Club choice and mindset that protect a score',
      ja: 'スコアを守るクラブ選択とメンタル',
    },
    query: {
      ko: '골프 코스 매니지먼트 스코어 관리 멘탈',
      en: 'golf course management scoring strategy mental',
      ja: 'ゴルフ コースマネジメント スコア メンタル',
    },
    keywords: ['코스매니지먼트', '멘탈', '스코어관리', '라운드전략', '클럽선택'],
  },
];

/** Topic lookup by id — used by the recommendation service and its tests. */
export const TOPIC_BY_ID: Record<string, YouTubeTopic> = Object.fromEntries(
  YOUTUBE_TOPICS.map((t) => [t.id, t])
);

/**
 * Shown when a student has records but none of them matched a topic (a
 * brand-new student whose coach has only written "잘했어요" so far). These are
 * the three areas that pay off for every handicap.
 */
export const DEFAULT_TOPIC_IDS = ['setup', 'contact', 'putting'] as const;
