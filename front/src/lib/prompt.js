/**
 * 퀴즈 설문 응답 결과를 바탕으로 AI 이미지 및 텍스트 생성용 프롬프트를 빌드합니다.
 */
export function generatePromptFromAnswers(answers) {
  // answers: { [questionId]: optionIndex }
  // 예: { 1: 0, 2: 1, ... }

  let personalityTraits = [];
  let lifeValue = "";
  let energyType = "";

  // 1. 에너지 방향 (Q1, Q2, Q3)
  const eCount = [answers[1], answers[2], answers[3]].filter(v => v === 0).length;
  if (eCount >= 2) {
    energyType = "외향적이고 사람들과의 연결을 통해 활력을 얻는";
    personalityTraits.push("사교적인", "활발한");
  } else {
    energyType = "내향적이고 혼자만의 사색과 평온을 통해 충전하는";
    personalityTraits.push("차분한", "독립적인");
  }

  // 2. 가치관 방향 (Q4, Q5, Q6)
  const vCount = [answers[4], answers[5], answers[6]].filter(v => v === 0).length;
  if (vCount >= 2) {
    lifeValue = "기술의 혁신과 효율적인 성장을 추구";
    personalityTraits.push("미래지향적인", "논리적인");
  } else {
    lifeValue = "자연과의 조화 및 내면의 평화, 예술적 가치를 중요시";
    personalityTraits.push("감성적인", "자연친화적인");
  }

  // 3. 작업 스타일 (Q7, Q8, Q9)
  const sCount = [answers[7], answers[8], answers[9]].filter(v => v === 0).length;
  if (sCount >= 2) {
    personalityTraits.push("체계적인", "계획적인");
  } else {
    personalityTraits.push("창의적인", "즉흥적인");
  }

  // 4. 나머지 질문들을 통한 추가 키워드
  if (answers[10] === 0) personalityTraits.push("호기심 많은");
  if (answers[11] === 0) personalityTraits.push("리더십 있는");
  if (answers[12] === 1) personalityTraits.push("신중한");
  if (answers[13] === 0) personalityTraits.push("열정적인");
  if (answers[14] === 0) personalityTraits.push("현실적인");

  // 중복 제거 및 상위 3개 키워드 추출
  const uniqueTraits = Array.from(new Set(personalityTraits)).slice(0, 3);

  // 최종 프롬프트 구성
  const textPrompt = `사용자는 ${energyType} 사람이며, 평소 ${lifeValue}하는 삶의 방식을 선호합니다. 성격적 특징으로는 [${uniqueTraits.join(', ')}] 등이 돋보입니다. 이 사람의 30년 후 미래 자아의 모습(미래의 직업, 성격, 조언)을 따뜻하고 지혜로운 어조로 작성해 주세요.`;

  // 이미지 생성용 스타일 프롬프트
  const imagePrompt = `A warm, elegant photographic portrait of a wise 60-year-old Korean individual in their future occupation. They have gentle, deep-thinking eyes, subtle smile lines, reflecting a lifetime of ${uniqueTraits.join(', ')} experience. Ambient soft warm lighting, 85mm lens, highly detailed facial features, professional studio photography style, extremely clean background, photorealistic, Raycast/Linear aesthetic.`;

  return {
    textPrompt,
    imagePrompt,
    keywords: uniqueTraits,
  };
}
