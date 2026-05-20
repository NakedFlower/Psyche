import json
import os
import boto3
from datetime import datetime, timezone
from botocore.exceptions import ClientError

# ==============================================================================
# AWS DynamoDB 테이블 생성 CLI 명령어 가이드 (FutureSelfWaitlist)
# ==============================================================================
#
# aws dynamodb create-table \
#     --table-name FutureSelfWaitlist \
#     --attribute-definitions AttributeName=email,AttributeType=S \
#     --key-schema AttributeName=email,KeyType=HASH \
#     --billing-mode PAY_PER_REQUEST \
#     --region ap-northeast-2
#
# ==============================================================================

# CORS Headers helper
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
    "Access-Control-Allow-Methods": "DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT"
}

def handler(event, context):
    """
    AWS Lambda handler for Email Waitlist Registration.
    Saves:
      - email (Partition Key)
      - createdAt (ISO 8601)
      - quizResult (Map / Optional)
      - source (String / Web, Share etc.)
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
        email = body.get('email')
        quiz_result = body.get('quizResult', {})
        source = body.get('source', 'web')

        if not email or '@' not in email:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'message': '올바른 형식의 이메일 주소가 유실되었습니다.'}, ensure_ascii=False)
            }

        # DynamoDB 연동
        dynamodb = boto3.resource('dynamodb', region_name=os.environ.get('AWS_REGION', 'ap-northeast-2'))
        table_name = os.environ.get('DYNAMODB_TABLE_NAME', 'FutureSelfWaitlist')
        table = dynamodb.Table(table_name)

        # 현재 시각 ISO 8601 타임스탬프 획득
        created_at = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

        # GSI 불필요, 이메일 중복 방지는 PK Condition Write로 처리
        try:
            table.put_item(
                Item={
                    'email': email,
                    'createdAt': created_at,
                    'quizResult': quiz_result,
                    'source': source
                },
                ConditionExpression='attribute_not_exists(email)'
            )
        except ClientError as e:
            if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                return {
                    'statusCode': 409, # 409 Conflict
                    'headers': CORS_HEADERS,
                    'body': json.dumps({'message': '이미 사전 신청이 완료된 이메일입니다.'}, ensure_ascii=False)
                }
            else:
                print(f"DynamoDB ClientError: {str(e)}")
                raise e

        # 성공 반환
        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'success': True,
                'message': '웨이트리스트 등록에 성공했습니다.',
                'email': email
            }, ensure_ascii=False)
        }

    except Exception as e:
        print(f"Error handling request: {str(e)}")
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'message': f"Internal Server Error: {str(e)}"}, ensure_ascii=False)
        }
