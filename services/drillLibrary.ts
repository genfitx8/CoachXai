import type { DrillRecommendation, FaultId } from '../types/swingFault';

/**
 * Curated drill prescriptions per fault. Content is Korean and biased toward
 * drills that need no more equipment than a club + a wall/mirror — the app
 * runs on phones, and most students are practicing at home or a range bay.
 *
 * Each entry lists 2–3 drills ordered by escalation: the first is the
 * simplest quick-fix, later ones build the underlying skill. When a fault has
 * no known drill (e.g. `weak_shoulder_turn` for a golfer with a physical
 * limitation), the array is empty and the UI shows the fault without drills.
 */
export const DRILL_LIBRARY: Record<FaultId, DrillRecommendation[]> = {
  early_extension: [
    {
      name: '엉덩이 벽 드릴',
      description: '어드레스에서 엉덩이를 벽에 대고 백스윙-다운스윙 내내 벽에서 떨어지지 않게 유지합니다. 임팩트까지 골반이 카메라 쪽(공 쪽)으로 밀리지 않는 감각을 기릅니다.',
      duration: '10회 x 3세트',
      props: ['벽 또는 얼라인먼트 스틱'],
    },
    {
      name: '골반 후방 유지 슬로우 스윙',
      description: '반 스피드로 스윙하며 임팩트 순간에 골반이 오히려 살짝 뒤(등 쪽)로 빠지는 감각을 만드세요. 처음엔 과장해서 연습해도 무방합니다.',
      duration: '5분',
    },
    {
      name: '의자 뒷면 감각 훈련',
      description: '엉덩이 뒤에 의자를 두고 스윙 중 의자와 접촉이 끊기지 않게 유지. 상체가 세워지는 습관을 강력하게 억제합니다.',
      duration: '10회',
      props: ['의자'],
    },
  ],
  head_sway: [
    {
      name: '머리 고정 미러 드릴',
      description: '거울 앞에서 어드레스, 머리를 미러의 특정 지점에 맞춘 뒤 슬로우 스윙. 스윙 내내 머리가 그 지점을 벗어나지 않는지 확인합니다.',
      duration: '10회 x 2세트',
      props: ['거울'],
    },
    {
      name: '벽 이마 드릴',
      description: '벽에 이마를 살짝 대고 어드레스 자세를 잡은 뒤, 벽과 이마 접촉을 유지하며 백스윙-다운스윙. 특히 백스윙에서 머리가 오른쪽으로 밀리는 습관을 교정합니다.',
      duration: '10회',
      props: ['벽'],
    },
  ],
  spine_loss: [
    {
      name: '척추 각 유지 드릴',
      description: '코치나 파트너가 뒤에서 척추 상단(승모근)에 손을 얹고 어드레스. 스윙 내내 그 접촉이 사라지지 않도록 유지합니다.',
      duration: '10회 x 2세트',
    },
    {
      name: '경사 감각 하프 스윙',
      description: '어드레스 척추 앞기울기를 유지한 채 하프 스윙만. 임팩트에서 상체가 세워지지 않고 원래 각도를 회복하는 근감각을 만듭니다.',
      duration: '5분',
    },
  ],
  weak_x_factor: [
    {
      name: '어깨-골반 분리 스트레치',
      description: '클럽을 어깨에 얹고 하체 고정 상태에서 어깨만 최대 회전. 매일 아침 20회씩 반복하면 X-factor 가동범위가 넓어집니다.',
      duration: '20회 x 2세트',
      props: ['클럽'],
    },
    {
      name: '오른발 뒤로 백스윙',
      description: '오른발(오른손잡이 기준)을 뒤로 반 발자국 빼고 스윙. 하체 회전이 제한되며 상체 코일이 훨씬 크게 느껴집니다.',
      duration: '10회',
    },
  ],
  over_swing: [
    {
      name: 'L-to-L 하프 스윙',
      description: '백스윙 톱에서 리드 팔이 지면과 평행이 될 때 멈추고 다운스윙 시작. 오버스윙 습관을 리셋합니다.',
      duration: '20회',
    },
    {
      name: '스텝 백스윙',
      description: '천천히 6카운트로 백스윙, 톱 도착 지점을 정확히 인지하고 정지 → 3카운트 다운. 톱의 정확한 위치 감각을 만듭니다.',
      duration: '10회',
    },
  ],
  quick_tempo: [
    {
      name: '3:1 카운트 스윙',
      description: '백스윙 "하나-둘-셋", 다운스윙 "하나"의 리듬으로 매 스윙. 투어 평균 템포 비율 3:1을 몸에 각인합니다.',
      duration: '10회',
    },
    {
      name: '메트로놈 백스윙',
      description: '메트로놈 90 BPM 기준 백스윙 3박(2초), 다운스윙 1박(약 0.7초)으로 연습.',
      duration: '5분',
      props: ['메트로놈 앱'],
    },
  ],
  slow_tempo: [
    {
      name: '릴리즈 가속 드릴',
      description: '다운스윙에서 임팩트 구간의 클럽 헤드 가속을 의식적으로 크게. 헤드가 손을 앞질러 나가는 감각.',
      duration: '10회',
    },
    {
      name: '스피드 스틱 스윙',
      description: '가벼운 클럽(스피드 스틱 또는 뒤집은 드라이버)으로 최대 스피드 3연속. 감각 회복 후 정상 클럽으로 복귀.',
      duration: '3회 x 3세트',
      props: ['스피드 스틱 또는 뒤집은 드라이버'],
    },
  ],
  off_plane_flat: [
    {
      name: '샤프트 플레인 스틱 드릴',
      description: '얼라인먼트 스틱을 어드레스 시 샤프트 각도로 지면에 꽂고, 백스윙 손이 스틱 라인을 따라 올라가도록 훈련.',
      duration: '10회',
      props: ['얼라인먼트 스틱'],
    },
  ],
  off_plane_steep: [
    {
      name: '앉아서 백스윙',
      description: '높은 의자나 스툴에 걸터앉아 백스윙만. 어깨가 수직으로 위로 올라가는 습관을 교정하고 회전 중심으로 만듭니다.',
      duration: '10회 x 2세트',
      props: ['높은 의자'],
    },
    {
      name: '벨트 라인 유지 드릴',
      description: '백스윙에서 클럽 헤드가 벨트 라인을 지날 때 지면과 평행이 되도록 체크. 너무 세워지는 궤도를 낮춥니다.',
      duration: '10회',
    },
  ],
  poor_knee_flex: [
    {
      name: '어드레스 스쿼트 홀드',
      description: '어드레스 자세로 5초 정지 → 원상복귀 반복. 무릎 굽힘 각도를 몸에 각인합니다.',
      duration: '10회 x 2세트',
    },
  ],
  address_over_extension: [
    {
      name: '무릎 굽힘 각도 리셋',
      description: '거울 앞에서 무릎 굽힘 155–165° 목표로 어드레스 후 셀프 체크. 처음엔 과장해서 낮춰 앉는 감각.',
      duration: '10회',
      props: ['거울'],
    },
  ],
  excessive_out_to_in: [
    {
      name: '인사이드 아웃 헤드 드릴',
      description: '공 뒤 30cm 지점에 티나 컵을 놓고, 다운스윙 때 그것을 헤드가 안쪽에서 바깥으로 지나가도록 스윙.',
      duration: '10회',
      props: ['빈 컵 또는 티'],
    },
    {
      name: '오른쪽 팔꿈치 옆구리 붙이기',
      description: '다운스윙 시작 시 오른팔 팔꿈치(RH 기준)를 옆구리에 붙인 채 하프 스윙. 아웃-투-인 궤도의 근본 원인을 교정.',
      duration: '10회',
    },
  ],
  excessive_in_to_out: [
    {
      name: '푸시 방지 하프 스윙',
      description: '풀 스윙 대신 하프 스윙으로 페이스 정면을 유지하는 연습. 과도한 인-투-아웃 궤도로 인한 푸시/훅을 억제.',
      duration: '10회',
    },
  ],
  weak_shoulder_turn: [
    {
      name: '어깨 회전 극대화 스트레치',
      description: '클럽을 등 뒤로 넣고 양팔로 감싼 뒤 좌우로 최대 회전. 스트레치 후 실제 스윙에서 회전 범위 재측정.',
      duration: '15회 x 2세트',
      props: ['클럽'],
    },
  ],
  reverse_spine: [
    {
      name: 'K-자세 백스윙',
      description: '백스윙 톱에서 척추가 목표 반대쪽으로 기울어지도록(K 모양) 의식적으로 유지. 리버스 스파인을 교정하는 핵심 감각.',
      duration: '10회',
    },
    {
      name: '오른쪽 골반 뒤로 빼기',
      description: '백스윙에서 오른쪽 골반을 뒤(캐디백 방향)로 빼는 감각. 상체가 왼쪽으로 기울지 않게 하체 로딩을 우선.',
      duration: '10회',
    },
  ],
  inverted_kinetic_sequence: [
    {
      name: '스텝인 다운스윙 드릴',
      description: '어드레스 후 백스윙 톱에서 리드 발(오른손잡이는 왼발)을 살짝 들었다가 다운스윙과 동시에 내딛기. 하체가 먼저 발화하는 순서를 몸에 각인합니다.',
      duration: '10회 x 3세트',
    },
    {
      name: '골반 리드 슬로우 다운',
      description: '반 스피드 다운스윙. 골반 회전이 시작된 뒤 상체가 따라오고 그 다음 팔이 오도록 카운트하며 반복. "1(골반)-2(상체)-3(팔)-4(손)" 리듬.',
      duration: '5분',
    },
    {
      name: '팔 지연 임팩트백',
      description: '임팩트백을 앞에 두고 다운스윙 초반에 팔을 최대한 지연시키다가 마지막 순간에만 릴리즈. 하체가 먼저 리드하는 감각을 강화합니다.',
      duration: '10회',
      props: ['임팩트백'],
    },
  ],
  simultaneous_kinetic_peaks: [
    {
      name: '분리 카운트 드릴',
      description: '풀 스윙 중 백스윙 톱 → 골반 회전 시작 → 팔 다운 → 손 릴리즈를 각각 명확한 4카운트로 분리해서 실행. 처음엔 과장해서 느리게, 점차 자연스러운 속도로.',
      duration: '10회',
    },
    {
      name: '두 스텝 다운스윙',
      description: '톱에서 정지 → 골반만 살짝 목표 쪽 이동 → 정지 → 상체·팔로 마무리. 세그먼트 간 순차 발화 감각을 만듭니다.',
      duration: '10회 x 2세트',
    },
  ],
};
