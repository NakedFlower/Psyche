# 미래 자아 생성기 (Future Self Generator) 서비스 안내서

본 문서는 **Next.js (App Router) 기반의 프론트엔드**와 **AWS Lambda + API Gateway + DynamoDB 기반의 백엔드**로 구성된 "미래 자아 생성" 바이럴 웹서비스의 통합 안내서입니다.

---

## 1. 실행 방법

### 프론트엔드 로컬 개발 환경 설정
프론트엔드 프로젝트 폴더(`viral/front`)에서 작업을 수행합니다.

1. **의존성 패키지 설치**
   ```bash
   cd viral/front
   npm install
   ```

2. **환경 변수 파일 생성 (`.env.local`)**
   `viral/front` 폴더 루트에 `.env.local` 파일을 생성하고 아래와 같이 채워 넣습니다.
   ```env
   # API Gateway 배포 주소 (로컬에서 실제 연동 시 작성, 더미 모드일 때는 무시됨)
   NEXT_PUBLIC_API_URL=https://your-api-gateway-id.execute-api.ap-northeast-2.amazonaws.com/prod
   ```

3. **개발 서버 실행**
   ```bash
   npm run dev
   ```
   실행 후 브라우저에서 [http://localhost:3000](http://localhost:3000)으로 접속하여 결과를 실시간으로 확인합니다.

5. **정적 빌드 및 Export**
   Next.js 정적 빌드를 수행하여 S3 업로드용 HTML/CSS/JS 에셋을 생성합니다.
   ```bash
   # package.json에 설정된 빌드 명령어 수행 (next build)
   npm run build
   ```
   *참고: `next.config.mjs`에 `output: 'export'`가 설정되어 있어, `npm run build`를 실행하면 자동으로 루트 하위에 `out` 폴더가 생성되고 모든 정적 빌드 산출물이 저장됩니다.*

---

## 2. 폴더 구조 설명

프로젝트의 전체 폴더 및 파일 역할에 대한 한 줄 요약입니다.

```text
viral/
├── front/                       # 프론트엔드 (Next.js App Router)
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.jsx       # 최상위 레이아웃 (Pretendard 폰트 로드 및 SEO 메타 설정)
│   │   │   ├── page.jsx         # 메인 멀티스텝 컨트롤러 (Landing, Upload, Quiz, Loading 조율)
│   │   │   ├── page.css         # 메인 레이아웃 및 펄스 로딩 화면 스타일
│   │   │   └── result/
│   │   │       ├── page.jsx     # 결과 페이지 (sessionStorage에서 복원 및 모달 제어)
│   │   │       └── page.css     # 결과 페이지 컨테이너 및 헤더 스타일
│   │   ├── components/
│   │   │   ├── home/
│   │   │   │   ├── Home.jsx     # Hero 인트로 섹션 컴포넌트
│   │   │   │   └── Home.css     # Hero 섹션 및 모바일 반응형 그리드 스타일
│   │   │   ├── quiz/
│   │   │   │   ├── Quiz.jsx     # 20문항 성격 퀴즈 컨트롤러 및 상단 진행바
│   │   │   │   └── Quiz.css     # 선택지 카드 스타일 및 모션 애니메이션
│   │   │   ├── upload/
│   │   │   │   ├── Upload.jsx   # 드래그앤드롭 + 파일 검증용 사진 업로드 컴포넌트
│   │   │   │   └── Upload.css   # 업로드 드롭존 및 원형 프리뷰 프레임 스타일
│   │   │   ├── resultCard/
│   │   │   │   ├── ResultCard.jsx # 인스타 스타일 미래 자아 ID 카드 및 공유 유틸리티
│   │   │   │   └── ResultCard.css # 바코드, 디지털 스탬프, 이대일 데스크톱 그리드 스타일
│   │   │   └── waitlist/
│   │   │       ├── WaitlistModal.jsx # 대화하기 사전 예약 모달 (중복 신청 방지 체크)
│   │   │       └── WaitlistModal.css # 모달 블러 오버레이 및 성공 피드백 뷰 스타일
│   │   ├── lib/
│   │   │   ├── api.js           # API Gateway / S3 Direct 연동 함수 (USE_DUMMY 제어 지원)
│   │   │   └── prompt.js        # 20문항 응답 기반 최적의 AI 프롬프트 생성 알고리즘
│   │   └── styles/
│   │       └── globals.css      # CSS 커스텀 프로퍼티 디자인 토큰 및 리셋 스타일
│   ├── next.config.mjs          # 정적 export ('output: export') 및 외부 이미지 제어
│   └── package.json             # 개발용 의존성 라이브러리 및 실행 스크립트 모음
│
├── back/                        # 백엔드 (AWS Lambda Python 3.12)
│   └── lambda/
│       ├── generate/
│       │   ├── handler.py       # S3 Presigned URL 발급 및 AI 변환 시뮬레이터 Lambda
│       │   └── requirements.txt # AI 변환용 외부 SDK 명세 (기본 boto3 내장으로 빈 파일)
│       └── waitlist/
│           ├── handler.py       # 사전 신청 메일 중복 없이 DynamoDB에 적재하는 Lambda
│           └── requirements.txt # 웨이트리스트 전용 파이썬 외부 SDK 명세
│
└── asdf.md                      # 통합 개발 가이드 및 AWS 배포 가이드 문서 (본 파일)
```

---

## 3. AI API 연결 포인트 가이드

`back/lambda/generate/handler.py` 내부의 `call_image_api`와 `call_text_api`에서 임베디드 코드를 다음과 같이 교체할 수 있습니다.

### A. 이미지 생성 API 교체 방법 (얼굴 유사도 보존)
사용자의 얼굴 모양새를 그대로 유지하면서 늙은 모습으로 나이 변환(Aging)을 수행할 때는 **Replicate의 InstantID** 모델을 연동하는 것이 가장 효과적입니다.

```python
# back/lambda/generate/handler.py의 call_image_api 함수 내부 교체 예시
import replicate
import os

def call_image_api(s3_key, quiz_result, image_prompt):
    # Replicate API Key 설정 필수
    os.environ["REPLICATE_API_TOKEN"] = "r8_your_replicate_token_here"
    
    # 1. 프론트엔드가 업로드한 원본 사진의 S3 공개 URL 획득
    bucket_name = os.environ.get("UPLOAD_BUCKET_NAME", "your-bucket-name")
    s3_url = f"https://{bucket_name}.s3.ap-northeast-2.amazonaws.com/{s3_key}"
    
    # 2. InstantID 가동
    output = replicate.run(
        "lucataco/instantid:e7da2d9b23b379cf66191b7d5e4680bf4a6b2512f451f1f9e2ed1f13b5e43a9b",
        input={
            "image": s3_url,
            "prompt": image_prompt + ", wise elderly face, photorealistic style, highly detailed skin",
            "negative_prompt": "blurry, young, bad proportions, rendering, cartoon, draw",
            "identity_strength": 0.85,
            "image_strength": 0.80
        }
    )
    return output[0] # 생성된 이미지의 웹 호스팅 URL 반환
```

### B. 텍스트 생성 API 교체 방법
성격 데이터에 부합하는 정교하고 감성적인 미래 스토리와 전언을 생성할 때는 **OpenAI GPT-4o**의 JSON Mode를 연동하는 것이 좋습니다.

```python
# back/lambda/generate/handler.py의 call_text_api 함수 내부 교체 예시
import openai
import json
import os

def call_text_api(quiz_result, text_prompt):
    client = openai.OpenAI(api_key=os.environ.get("OPENAI_API_KEY", "sk-your-key-here"))
    
    system_instruction = (
        "당신은 30년 후 미래 라이프 예측 분석관입니다. 사용자의 가치관 및 성격 특성을 고려하여, "
        "60대가 되었을 때 가질 '세련되고 감동적인 미래 직업', '깊이 있는 성격 설명', '현재의 나에게 해주는 깊은 조언'을 만드세요. "
        "반드시 아래 규격의 JSON 형식으로만 반환해야 합니다.\n"
        "포맷: {\"job\": \"...\", \"personality\": \"...\", \"message\": \"...\"}"
    )
    
    response = client.chat.completions.create(
        model="gpt-4o",
        response_format={ "type": "json_object" },
        messages=[
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": text_prompt}
        ]
    )
    
    return json.loads(response.choices[0].message.content)
```

---

## 4. AWS 배포 전략

### 프론트엔드: S3 정적 호스팅 + CloudFront 배포 절차

1. **S3 버킷 생성**
   - AWS S3 콘솔에서 버킷(예: `future-self-web`)을 생성합니다.
   - 정적 빌드물이 들어갈 버킷이므로 퍼블릭 액세스를 기본적으로 차단하고, CloudFront OAC(Origin Access Control)를 연동하여 안전하게 관리합니다.

2. **정적 빌드**
   ```bash
   cd viral/front
   npm run build
   ```
   빌드가 끝나면 `viral/front/out` 폴더 내에 빌드 결과물이 모입니다.

3. **S3 버킷에 빌드 파일 업로드**
   - AWS CLI를 사용하여 간편하게 업로드할 수 있습니다:
     ```bash
     aws s3 sync out/ s3://future-self-web/ --delete
     ```

4. **CloudFront 배포 구성**
   - CloudFront 배포 생성으로 이동하여 S3 버킷을 Origin으로 지정합니다.
   - **OAC (Origin Access Control)** 설정을 생성하여 S3 버킷 정책(Bucket Policy)이 CloudFront의 읽기 요청만 허용하도록 연결합니다.
   - **Default Root Object**를 `index.html`로 설정합니다.
   - SPA(Single Page Application) 혹은 라우팅 문제를 해결하기 위해, CloudFront **Error Pages** 탭에서 `404 Not Found` 에러에 대한 응답 주소를 `/index.html` (또는 결과 정적 페이지 `/result.html`)로 지정하고 응답 코드를 `200`으로 바인딩합니다.

---

### 백엔드: Lambda zip 배포 + API Gateway 설정

#### 1. DynamoDB 테이블 생성 CLI 명령어
이메일을 유일한 기본 키(PK)로 가지는 비관계형 데이터베이스를 생성합니다.
```bash
aws dynamodb create-table \
    --table-name FutureSelfWaitlist \
    --attribute-definitions AttributeName=email,AttributeType=S \
    --key-schema AttributeName=email,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region ap-northeast-2
```

#### 2. Lambda 함수 패키징 및 업로드
각 람다 함수의 경로(`back/lambda/generate`, `back/lambda/waitlist`)로 이동하여 소스코드를 압축 파일(`.zip`) 형태로 패키징하여 배포합니다.

- **Waitlist 람다 함수 패키징 (외부 라이브러리가 없는 경우)**
  ```bash
  cd back/lambda/waitlist
  # Windows PowerShell에서 압축
  Compress-Archive -Path handler.py -DestinationPath waitlist.zip
  ```

- **Generate 람다 함수 패키징 (외부 SDK 포함 시 - 예: requests 등)**
  ```bash
  cd back/lambda/generate
  # 라이브러리를 특정 폴더에 내려받아 함께 패키징
  pip install -r requirements.txt -t ./package
  # 라이브러리 폴더와 소스코드를 zip으로 병합
  cd package
  Compress-Archive -Path * -DestinationPath ../generate.zip
  cd ..
  Compress-Archive -Path handler.py -Update -DestinationPath generate.zip
  ```

압축이 완료되면 AWS Lambda 콘솔에서 생성한 함수에 각각 `.zip` 파일을 업로드합니다.

#### 3. API Gateway 설정 및 CORS 주의사항
1. API Gateway 콘솔로 이동하여 **HTTP API** 또는 **REST API**를 생성합니다.
2. 각 API 라우트를 설계합니다:
   - `POST /generate` -> `generate-lambda` 연결
   - `POST /waitlist` -> `waitlist-lambda` 연결
3. **CORS 설정**:
   - API Gateway 자체의 CORS 탭에서 설정을 켜는 것과 함께, Lambda 코드(`handler.py`)에서 직접 반환하는 `Access-Control-Allow-Origin` 및 `Access-Control-Allow-Headers` 등의 CORS 헤더가 어긋나지 않도록 일치시켜야 합니다.
   - CORS 에러 방지를 위해 Lambda 함수의 응답 맵핑 형태에서 헤더에 `*`를 확실하게 대입해 반환하는 패턴을 적용해 두었습니다.
4. **스테이지 배포**:
   - `prod` 스테이지를 생성하여 배포하고 발급된 API 엔드포인트 URL을 획득합니다.

#### 4. Lambda 환경변수 설정 방법
Lambda 설정 -> 환경 변수(Environment Variables)에서 아래의 값을 주입합니다.

- **`generate-lambda` 환경 변수**:
  - `AWS_REGION`: `ap-northeast-2`
  - `UPLOAD_BUCKET_NAME`: 업로드용 사진이 모일 S3 버킷 명칭 (예: `future-self-uploads-bucket`)
  - *OpenAI 및 Replicate 연동 시*: `OPENAI_API_KEY`, `REPLICATE_API_TOKEN`

- **`waitlist-lambda` 환경 변수**:
  - `AWS_REGION`: `ap-northeast-2`
  - `DYNAMODB_TABLE_NAME`: `FutureSelfWaitlist`
