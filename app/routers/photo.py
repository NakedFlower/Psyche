import os
import boto3
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

S3_FACE_BUCKET = os.getenv("S3_FACE_BUCKET", "psyche-face-863771938068-ap-northeast-2-an")
AWS_REGION = os.getenv("AWS_REGION", "ap-northeast-2")


class PresignedUrlRequest(BaseModel):
    """Request schema for generating a presigned S3 upload URL."""
    session_id: str
    filename: str


class PresignedUrlResponse(BaseModel):
    """Response schema with presigned URL and S3 object key."""
    upload_url: str
    object_key: str


@router.get("/presigned-url", response_model=PresignedUrlResponse)
def get_presigned_url(session_id: str, filename: str, content_type: str = "image/jpeg"):
    """
    Generate a presigned URL for uploading a photo to the psyche-face S3 bucket.
    The object is stored under sessions/{session_id}/{filename}.
    """
    object_key = f"sessions/{session_id}/{filename}"

    try:
        s3_client = boto3.client("s3", region_name=AWS_REGION)
        upload_url = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": S3_FACE_BUCKET,
                "Key": object_key,
                "ContentType": content_type,
            },
            ExpiresIn=600,  # 10 minutes
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate presigned URL: {str(e)}")

    return PresignedUrlResponse(upload_url=upload_url, object_key=object_key)
