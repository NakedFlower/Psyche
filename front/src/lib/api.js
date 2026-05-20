import { generatePromptFromAnswers } from './prompt';

// 실제 백엔드 연동이 필요할 시 false로 변경합니다.
export const USE_DUMMY = false;

// AWS API Gateway 엔드포인트 URL
const API_BASE_URL = 'https://fnqhmeowy5.execute-api.ap-northeast-2.amazonaws.com';

/**
 * 1. S3 Presigned URL 발급 요청
 */
export async function getPresignedUrl(filename, filetype) {
  if (USE_DUMMY) {
    return {
      uploadUrl: 'https://mock-s3-upload-url.local/upload',
      s3Key: `uploads/${Date.now()}_${filename}`
    };
  }

  const response = await fetch(`${API_BASE_URL}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'get_presigned_url', filename, filetype })
  });

  if (!response.ok) {
    throw new Error('S3 업로드 URL 발급에 실패했습니다.');
  }

  return await response.json();
}

/**
 * 2. S3 버킷에 이미지 파일 직접 업로드 (PUT)
 */
export async function uploadToS3(uploadUrl, file) {
  if (USE_DUMMY) {
    // 더미 모드일 때는 1초 대기 후 성공 반환
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return true;
  }

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file
  });

  if (!response.ok) {
    throw new Error('S3 이미지 업로드에 실패했습니다.');
  }

  return true;
}

/**
 * 3. AI 변환 처리 요청 (S3 key + 설문 응답 전달)
 */
export async function generateFutureSelf(s3Key, answers) {
  // 설문 응답을 기반으로 키워드 및 프롬프트 빌드
  const promptData = generatePromptFromAnswers(answers);

  if (USE_DUMMY) {
    // 3초 지연 후 프리미엄 결과 반환
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 설문에 맞춤형 직업 결정
    let job = "도시 생태 및 친환경 건축 아키텍트";
    let message = "30년 전 복잡한 도시와 자연을 보며 그렸던 당신의 푸른 꿈이 마침내 현실이 되었군요. 당신의 따뜻한 시선과 끊임없는 실천이 많은 이들에게 쉼터를 선물했습니다.";
    
    if (promptData.keywords.includes("외향적인") && promptData.keywords.includes("미래지향적인")) {
      job = "글로벌 AI 휴머니스트 & 커뮤니케이터";
      message = "기술과 사람의 경계를 지우고, 세상 모든 사람이 동등하게 연결될 수 있도록 헌신한 당신의 노력이 세계적인 흐름이 되었습니다. 수많은 영감이 당신의 목소리에서 퍼져 나갑니다.";
    } else if (promptData.keywords.includes("차분한") && promptData.keywords.includes("감성적인")) {
      job = "자연 공명 예술 치유 작가";
      message = "세상의 소음에서 한 발짝 물러나, 마음이 지친 사람들을 위한 조용하고 깊은 안식처를 글로써 지어왔군요. 당신이 남긴 단어들은 시대를 초월하는 위로가 되었습니다.";
    } else if (promptData.keywords.includes("체계적인") && promptData.keywords.includes("미래지향적인")) {
      job = "우주 오아시스 테라포밍 설계관";
      message = "데이터와 혁신의 정밀한 궤도를 따라, 먼 우주에 새로운 삶의 가능성을 꽃피우는 데 결정적으로 기여했군요. 당신의 개척 정신은 다음 세대들의 나침반이 될 것입니다.";
    }

    return {
      futureImageUrl: '/images/future_self_dummy.png',
      job,
      keywords: promptData.keywords,
      message,
      personality: `젊은 시절 가졌던 ${promptData.keywords.join(', ')} 특징들이 오랜 시간 속에서 우아하고 부드럽게 무르익었습니다. 사람들을 품어주는 사려 깊고 온화한 태도가 당신의 삶을 더욱 가치 있게 빛내고 있습니다.`,
      quizSummary: answers
    };
  }

  const response = await fetch(`${API_BASE_URL}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'generate_future',
      s3Key,
      quizResult: answers,
      promptData
    })
  });

  if (!response.ok) {
    throw new Error('미래 자아 생성에 실패했습니다.');
  }

  return await response.json();
}

/**
 * 4. 웨이트리스트 이메일 등록 요청
 */
export async function registerWaitlist(email, quizResult = {}, source = 'web') {
  if (USE_DUMMY) {
    // 더미 모드일 때는 1초 대기 후 성공 반환
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { success: true, message: '웨이트리스트 등록에 성공했습니다.' };
  }

  const response = await fetch(`${API_BASE_URL}/waitlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, quizResult, source })
  });

  if (!response.ok) {
    // 409 Conflict 등 중복 등록 오류 대처
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || '웨이트리스트 등록 중 오류가 발생했습니다.');
  }

  return await response.json();
}
