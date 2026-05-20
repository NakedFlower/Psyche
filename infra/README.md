# 미래 자아 생성기 (Future Self Generator) 테라폼 인프라 배포 안내서

이 폴더(`viral/infra`)에는 서비스 전체를 AWS(클라우드)에 단 몇 줄의 명령어로 원클릭 배포하기 위한 **테라폼(Terraform) 코드**가 담겨 있습니다. 

클라우드와 인프라를 처음 다루는 초보자분들도 차근차근 따라 하실 수 있도록 기초 단계부터 아주 구체적으로 상세히 설명하겠습니다!

---

## 📌 전체 배포 요약 (미리 보기)

이 테라폼 코드를 적용하면 AWS 상에 다음과 같은 클라우드 서비스들이 자동으로 얽혀 설치됩니다:
1. **S3 버킷 A (프론트엔드)**: Next.js 정적 빌드 파일(`html, css, js`)이 안전하게 보관되는 저장소.
2. **CloudFront (CDN)**: 전 세계 사용자에게 0.1초 만에 웹페이지를 서빙하고 HTTPS(보안) 프로토콜을 입혀주는 번개 배달부. Next.js의 다이렉트 페이지 라우팅(404 에러 방지) 설정이 내장되어 있습니다.
3. **S3 버킷 B (이미지 업로드)**: 사용자가 업로드한 원본 사진이 저장되는 저장소. (웹 브라우저에서 직접 업로드할 수 있도록 CORS 허용 세팅 완료)
4. **DynamoDB (사전예약 데이터베이스)**: 이메일 중복이 불가능하도록 설계된 대화 사전예약 정보 저장 테이블.
5. **AWS Lambda 2개 (백엔드 코드)**: Python 3.12 런타임 환경에서 동작하며, 자동으로 local 폴더의 파이썬 코드를 묶어서 배포해 줍니다.
6. **API Gateway (HTTP API)**: 프론트엔드가 백엔드 Lambda 함수들과 안전하게 HTTPS 통신을 주고받도록 조율하는 대문.

---

## 🛠️ [1단계] 배포 전 사전 준비작업 (완전 정복)

테라폼 명령어를 실행하기 전, 로컬 컴퓨터에 딱 두 가지 프로그램이 설치되어 있어야 합니다.

### 1. 테라폼(Terraform) 설치하기
테라폼은 인프라를 텍스트 코드로 설계하고 집행하게 해주는 설치형 프로그램입니다.
* **설치 방법 (Windows)**:
  1. [테라폼 공식 다운로드 페이지](https://developer.hashicorp.com/terraform/downloads)에 접속합니다.
  2. Windows용 `AMD64` 또는 `386` (자신의 OS 비트에 맞게) zip 파일을 다운로드합니다.
  3. 압축을 푼 뒤 생성된 `terraform.exe` 파일을 적당한 폴더(예: `C:\terraform`)에 넣습니다.
  4. 윈도우 검색창에 `시스템 환경 변수 편집`을 검색해 열고, `Path` 환경 변수에 해당 폴더 경로(`C:\terraform`)를 추가합니다.
  5. VS Code 터미널 혹은 PowerShell을 새로 켜고 아래 명령어를 입력하여 정상적으로 작동하는지 검증합니다:
     ```bash
     terraform -v
     # 정상 출력 예시: Terraform v1.7.0 on windows_amd64
     ```

### 2. AWS CLI 설치 및 내 컴퓨터에 AWS 계정 로그인하기
테라폼이 내 AWS 계정에 로그인하여 리소스를 생성할 수 있도록 인증키 권한을 주어야 합니다.
* **설치 방법 (Windows)**:
  1. [AWS CLI 설치 링크](https://awscli.amazonaws.com/AWSCLIV2.msi)를 눌러 인스톨러를 받아 설치를 진행합니다.
  2. 터미널을 열고 로그인 상태를 확인할 수 있는 CLI 명령어가 실행되는지 봅니다:
     ```bash
     aws --version
     # 정상 출력 예시: aws-cli/2.15.0 Python/3.11.6 ...
     ```

* **AWS 인증키(IAM Access Key) 발급 및 등록**:
  1. [AWS 웹 관리 콘솔](https://console.aws.gov/)에 로그인합니다.
  2. 우측 상단의 계정명을 클릭하고 `보안 자격 증명 (Security Credentials)` 페이지로 들어갑니다.
  3. 스크롤을 내려 **액세스 키 (Access Keys)** 탭을 찾은 뒤 `액세스 키 만들기 (Create Access Key)`를 클릭합니다.
  4. 용도로 `Command Line Interface (CLI)`를 선택하고 키를 생성합니다.
  5. **액세스 키 ID(Access Key ID)** 와 **비밀 액세스 키(Secret Access Key)** 가 화면에 뜹니다. *(주의: 이 비밀 키는 단 한 번만 볼 수 있으므로 절대 분실하거나 다른 사람에게 노출하지 마세요!)*
  6. 내 로컬 터미널로 돌아와 아래의 명명어를 입력하여 로그인 설정을 가동합니다:
     ```bash
     aws configure
     ```
  7. 프롬프트가 한 줄씩 나타나면 방금 발급한 정보를 각각 입력해 줍니다:
     - `AWS Access Key ID [None]:` 액세스 키 ID 입력 후 Enter
     - `AWS Secret Access Key [None]:` 비밀 액세스 키 입력 후 Enter
     - `Default region name [None]:` **ap-northeast-2** 입력 후 Enter *(서울 리전)*
     - `Default output format [None]:` **json** 입력 후 Enter
  8. 로그인이 정상적으로 잘 설정되었는지 확인하려면 아래의 명령어를 입력해 보세요. 내 AWS 계정 ID 번호가 담긴 JSON 결과가 나오면 합격입니다:
     ```bash
     aws sts get-caller-identity
     ```

---

## 🚀 [2단계] 테라폼으로 클라우드 인프라 배포하기

준비가 완료되었다면 인프라 폴더(`viral/infra`)로 이동하여 순서대로 테라폼 명령어를 실행합니다.

```bash
# 1. 인프라 폴더로 이동합니다.
cd viral/infra

# 2. 테라폼 초기화 (AWS 연동용 플러그인과 모듈들을 인터넷에서 다운로드합니다)
terraform init
```

```bash
# 3. 배포 시뮬레이션 계획 확인
# 이 명령어를 입력하면 어떤 리소스들이 새로 추가(+), 수정(~), 삭제(-)될지 화면에 친절하게 보여줍니다.
terraform plan
```

```bash
# 4. 실전 배포 진행 (중요)
# 실제로 AWS 클라우드에 서버와 데이터베이스를 구축하기 시작합니다.
terraform apply
```

* `terraform apply`를 실행하면 중간에 한 번 정말 배포를 단행할 것인지 묻는 프롬프트가 나옵니다:
  ```text
  Do you want to perform these actions?
    Terraform will perform the actions described above.
    Only 'yes' will be accepted to approve.

    Enter a value: 
  ```
  이때 주저 없이 **`yes`** 라고 직접 알파벳으로 입력하고 Enter를 누르시면 됩니다.
  
* 약 2~4분 정도 리소스가 생성되기를 대기합니다. (특히 CloudFront 배포 생성 시 대기 시간이 2분 정도 소요될 수 있습니다)

* **배포 완료 시 화면에 출력되는 Output 정보 기록**:
  성공적으로 완료되면 터미널 하단에 초록색 글씨로 다음과 같은 배포 아웃풋 정보들이 출력됩니다. 이 값들을 복사해서 잘 메모해 두세요!
  ```text
  Outputs:
  api_gateway_url = "https://a1b2c3d4.execute-api.ap-northeast-2.amazonaws.com"
  cloudfront_url = "https://d1234567abcdef.cloudfront.net"
  dynamodb_table_name = "FutureSelfWaitlist"
  s3_frontend_bucket_name = "future-self-frontend-prod-xxxxxx"
  s3_upload_bucket_name = "future-self-user-uploads-prod-xxxxxx"
  ```

---

## 🔗 [3단계] 배포 후 내 소스코드와 인프라 연결하기

인프라가 생성되었으니, 이제 내 웹 서비스 코드(프론트엔드 및 백엔드)와 연동하여 동작하도록 설정을 맞춰야 합니다.

### 1. 프론트엔드 환경변수 및 배포 토글 변경
테라폼으로 생성된 백엔드 `API Gateway URL`을 프론트엔드에 심어줍니다.

1. **`front/src/lib/api.js` 파일 수정**:
   더미 모드로 되어있던 플래그를 실제 API 서버 통신 모드로 변경합니다.
   ```javascript
   // line 4 부근
   export const USE_DUMMY = false; // true에서 false로 변경!
   ```

2. **`front/.env.local` 파일 생성 또는 수정**:
   루트 경로에 `.env.local` 파일을 만들고 방금 획득한 테라폼 아웃풋의 `api_gateway_url`을 대입합니다.
   ```env
   NEXT_PUBLIC_API_URL=https://a1b2c3d4.execute-api.ap-northeast-2.amazonaws.com
   ```
   *(주의: 복사한 주소 뒤에 붙은 `/`나 공백이 들어가지 않도록 정확하게 붙여넣어 주세요!)*

---

## 📂 [4단계] Next.js 정적 빌드 및 S3 웹 호스팅 업로드

모든 소스 연동 설정이 끝났으므로 최종 Next.js 프론트엔드 파일을 빌드하고, 테라폼이 생성해 준 S3 프론트엔드 버킷에 동기화해 줍니다.

1. **Next.js 정적 아웃풋 빌드 실행**:
   ```bash
   cd viral/front
   
   # Next.js 빌드 수행 (빌드가 정상 종료되면 'out' 폴더에 html, css, js 파일들이 생성됩니다)
   npm run build
   ```

2. **빌드 산출물 S3 버킷에 원클릭 업로드 (동기화)**:
   테라폼 아웃풋의 `s3_frontend_bucket_name` (예: `future-self-frontend-prod-xxxxxx`)을 활용해 AWS CLI로 다이렉트 업로드합니다.
   ```bash
   # 'out' 폴더 전체를 S3 버킷의 루트 경로에 통째로 동기화 업로드합니다.
   aws s3 sync out/ s3://future-self-frontend-prod-xxxxxx/ --delete
   ```
   *(주의: 버킷 이름 뒤에 `/` 슬래시 기호를 꼼꼼히 확인하세요!)*

3. **최종 확인**:
   모든 업로드가 끝났습니다! 이제 브라우저 창을 열고 테라폼 아웃풋의 **`cloudfront_url`** (예: `https://d1234567abcdef.cloudfront.net`) 주소로 접속해 보세요. 
   내가 작성한 모바일 퍼스트 미래 자아 생성기 서비스가 HTTPS 보안 연결로 전 세계로 안전하게 배포되어 서비스되고 있는 모습을 확인하실 수 있습니다! 🚀

---

## 🧹 [기타] 생성된 인프라 리소스 전체 철거(삭제) 방법

테스트를 마치고 과금을 피하기 위해 배포했던 모든 AWS 리소스를 온전하게 지우고 싶다면 다음 명령어를 치면 됩니다. 테라폼이 1초 만에 깔끔하게 삭제해 줍니다.

```bash
cd viral/infra

# 전체 AWS 리소스 삭제 요청
terraform destroy
```
*(마찬가지로 물어보면 알파벳 **`yes`**를 타이핑해 준 뒤 엔터를 누르면 철거 프로세스가 완성됩니다)*
