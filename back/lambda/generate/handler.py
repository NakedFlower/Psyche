import json
import os
import uuid
import boto3
from botocore.exceptions import ClientError

# CORS Headers helper
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
    "Access-Control-Allow-Methods": "DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT"
}

def handler(event, context):
    """
    AWS Lambda handler for Future Self Generation.
    Handles:
      1. OPTIONS (CORS preflight)
      2. action == 'get_presigned_url' (S3 presigned PUT URL generation)
      3. action == 'generate_future' (Dummy AI image and text generation with connection guides)
    """
    # 1. Handle CORS Preflight request
    method = event.get('httpMethod') or event.get('requestContext', {}).get('http', {}).get('method', '')
    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': ''
        }

    try:
        # Parse body
        body = json.loads(event.get('body') or '{}')
        action = body.get('action')

        if not action:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'message': "Action파라미터가 유실되었습니다. ('get_presigned_url' 또는 'generate_future' 필요)"}, ensure_ascii=False)
            }

        # Action: S3 Presigned URL 발급
        if action == 'get_presigned_url':
            filename = body.get('filename')
            filetype = body.get('filetype', 'image/jpeg')

            if not filename:
                return {
                    'statusCode': 400,
                    'headers': CORS_HEADERS,
                    'body': json.dumps({'message': 'filename 파라미터가 유실되었습니다.'}, ensure_ascii=False)
                }

            result = get_presigned_url(filename, filetype)
            return {
                'statusCode': 200,
                'headers': CORS_HEADERS,
                'body': json.dumps(result)
            }

        # Action: AI 이미지 및 텍스트 생성
        elif action == 'generate_future':
            s3_key = body.get('s3Key')
            quiz_result = body.get('quizResult')
            prompt_data = body.get('promptData', {})

            if not s3_key or quiz_result is None:
                return {
                    'statusCode': 400,
                    'headers': CORS_HEADERS,
                    'body': json.dumps({'message': 's3Key 또는 quizResult 파라미터가 유실되었습니다.'}, ensure_ascii=False)
                }

            # AI 이미지 및 텍스트 호출 (현재는 Mock 형태, 주석에 상용 API 연동 가이드 내장)
            future_image_url = call_image_api(s3_key, quiz_result, prompt_data.get('imagePrompt'))
            future_story = call_text_api(quiz_result, prompt_data.get('textPrompt'))

            # 최종 응답 조립
            response_body = {
                'futureImageUrl': future_image_url,
                'job': future_story['job'],
                'keywords': prompt_data.get('keywords', ['통찰력 있는', '자유로운', '정교한']),
                'message': future_story['message'],
                'personality': future_story['personality'],
                'quizSummary': quiz_result
            }

            return {
                'statusCode': 200,
                'headers': CORS_HEADERS,
                'body': json.dumps(response_body, ensure_ascii=False)
            }

        else:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'message': f"지원하지 않는 action: '{action}'"}, ensure_ascii=False)
            }

    except Exception as e:
        print(f"Error handling request: {str(e)}")
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'message': f"Internal Server Error: {str(e)}"}, ensure_ascii=False)
        }


def get_presigned_url(filename, filetype):
    """
    S3 Presigned PUT URL을 발급합니다.
    """
    s3_client = boto3.client('s3', region_name=os.environ.get('AWS_REGION', 'ap-northeast-2'))
    bucket_name = os.environ.get('UPLOAD_BUCKET_NAME', 'future-self-uploads-bucket')
    
    # 고유한 S3 Key 생성
    unique_id = uuid.uuid4().hex
    s3_key = f"uploads/{unique_id}_{filename}"

    try:
        # PUT 업로드용 presigned URL 발급
        upload_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': bucket_name,
                'Key': s3_key,
                'ContentType': filetype
            },
            ExpiresIn=3600 # 1시간 유효
        )
        return {
            'uploadUrl': upload_url,
            's3Key': s3_key
        }
    except ClientError as e:
        print(f"Error generating presigned URL: {str(e)}")
        raise e


def call_image_api(s3_key, quiz_result, image_prompt):
    """
    사용자의 원본 사진 S3 Key와 설문 데이터를 기반으로 미래 모습 이미지를 생성합니다.
    
    --- API 교체 연동 가이드 ---
    
    1. OpenAI DALL-E 3 연동 예시:
       ```python
       import openai
       client = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])
       
       # DALL-E 3는 이미지 투 이미지(Image-to-Image)를 직접 제공하지 않으므로, 
       # 원본 사진의 얼굴 설명에 연령 변화(Aging) 프롬프트를 융합하여 텍스트-투-이미지로 생성합니다.
       response = client.images.generate(
           model="dall-e-3",
           prompt=image_prompt,
           n=1,
           size="1024x1024"
       )
       return response.data[0].url
       ```

    2. Replicate (Flux-InstantID / SDXL-InstantID) 연동 예시 (권장 - 얼굴 유사성 유지):
       ```python
       import replicate
       
       # Replicate API 토큰을 환경변수로 설정해야 합니다.
       # 원본 S3 이미지 URL을 획득합니다.
       bucket_name = os.environ["UPLOAD_BUCKET_NAME"]
       s3_url = f"https://{bucket_name}.s3.ap-northeast-2.amazonaws.com/{s3_key}"
       
       # InstantID 모델을 사용하여 원본 얼굴 구조를 유지한 채 늙은 모습으로 렌더링합니다.
       output = replicate.run(
           "lucataco/instantid:e7da2d9b23b379cf66191b7d5e4680bf4a6b2512f451f1f9e2ed1f13b5e43a9b",
           input={
               "image": s3_url,
               "prompt": image_prompt + " wise elderly face, photorealistic",
               "negative_prompt": "blurry, low quality, young, cartoon, drawing",
               "identity_strength": 0.8,
               "image_strength": 0.8
           }
       )
       return output[0] # 생성된 이미지 URL 리스트의 첫 번째 반환
       ```

    3. AWS Bedrock (Stable Diffusion XL) 연동 예시:
       ```python
       import boto3
       import base64
       
       bedrock = boto3.client(service_name='bedrock-runtime', region_name='us-east-1')
       body = json.dumps({
           "text_prompts": [{"text": image_prompt}],
           "cfg_scale": 7,
           "steps": 50,
       })
       response = bedrock.invoke_model(
           body=body,
           modelId="stability.stable-diffusion-xl-v1",
           accept="application/json",
           contentType="application/json"
       )
       response_body = json.loads(response.get('body').read())
       base64_image = response_body.get("artifacts")[0].get("base64")
       
       # base64 이미지 데이터를 S3 결과 버킷에 저장하고 해당 URL을 반환하는 코드를 작성합니다.
       return f"https://your-results-bucket.s3.amazonaws.com/{output_key}.png"
       ```
    """
    # 현재는 프리미엄 더미 이미지 URL 반환 (프론트엔드 내의 static asset)
    return "/images/future_self_dummy.png"


def call_text_api(quiz_result, text_prompt):
    """
    설문 결과를 분석하여 30년 후 미래 자아의 직업, 성격 설명, 전언 메시지를 생성합니다.
    
    --- API 교체 연동 가이드 ---
    
    1. OpenAI GPT-4o 연동 예시 (권장):
       ```python
       import openai
       client = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])
       
       system_instruction = (
           "당신은 미래 예측 분석관입니다. 사용자의 라이프스타일 설문 답변 요약본을 토대로 "
           "30년 후 60대의 세련되고 따뜻한 '미래의 직업', '내면의 성격 분석', '현재의 나에게 보내는 전언'을 작성해주세요. "
           "반드시 JSON 형태로 반환해야 합니다. 형식: {'job': '...', 'personality': '...', 'message': '...'}"
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

    2. AWS Bedrock (Claude 3.5 Sonnet) 연동 예시:
       ```python
       import boto3
       bedrock = boto3.client(service_name='bedrock-runtime', region_name='us-east-1')
       
       prompt = f"System: 당신은 미래 라이프 예측관입니다. 다음 데이터를 바탕으로 미래 자아 정보를 JSON 형식으로 작성하세요.\\n\\nHuman: {text_prompt}\\n\\nAssistant:"
       body = json.dumps({
           "anthropic_version": "bedrock-2023-05-31",
           "max_tokens": 1000,
           "messages": [{"role": "user", "content": text_prompt}]
       })
       response = bedrock.invoke_model(
           body=body,
           modelId="anthropic.claude-3-5-sonnet-20240620-v1:0"
       )
       response_body = json.loads(response.get('body').read())
       result_text = response_body['content'][0]['text']
       return json.loads(result_text)
       ```
    """
    # 퀴즈 분석 요약에 기반한 프리미엄 더미 데이터 반환
    # (실제 prompt.js의 keywords 조합에 맞춰 프론트가 처리하지만, Lambda 레벨에서도 기본 템플릿 제공)
    return {
        "job": "도시 생태 및 친환경 건축 아키텍트",
        "personality": "젊은 시절 가졌던 차분하고 섬세한 성향이 평생의 경험과 결합하여 깊은 지혜가 되었습니다. 복잡한 문제를 우아하고 자연스럽게 조율하는 능력이 탁월하며, 주변에 영감을 주는 조용한 안식처 역할을 해내고 있습니다.",
        "message": "30년 전 복잡한 도시와 자연을 보며 그렸던 너의 푸른 꿈이 마침내 현실이 되었단다. 매 순간 작은 씨앗을 심듯 묵묵히 걸어온 네 노력이 멋진 숲을 이루었으니, 불안해하지 말고 너의 길을 걸어가렴."
    }
