from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, File, UploadFile, Query
from fastapi.security import HTTPBasic, HTTPBasicCredentials
import cv2
import numpy as np
import torch
import asyncio
from typing import List
import tempfile
import os
import sys
import uvicorn
import requests
import base64
from PIL import Image, ImageDraw, ImageFont
from datetime import datetime
import json
from fastapi.staticfiles import StaticFiles
# 确保使用pip安装的ultralytics包
sys.path = [p for p in sys.path if r"B:\code\ultralytics-8.0.5" not in p]
from ultralytics import YOLO
from ultralytics.nn.tasks import DetectionModel
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
security = HTTPBasic()
app.mount("/history_logs", StaticFiles(directory="history_logs"), name="history_logs")
# 定义历史记录相关的目录和文件路径
HISTORY_LOGS_DIR = "history_logs"
IMAGES_DIR = os.path.join(HISTORY_LOGS_DIR, "images")
VIDEOS_DIR = os.path.join(HISTORY_LOGS_DIR, "videos")
LOG_FILE = os.path.join(HISTORY_LOGS_DIR, "logs.json")

# 后续的路由和 WebSocket 处理代码
# 创建必要的目录，如果不存在的话
os.makedirs(IMAGES_DIR, exist_ok=True)
os.makedirs(VIDEOS_DIR, exist_ok=True)

# 更完善的CORS配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# 修复模型加载错误
original_torch_load = torch.load


def patched_torch_load(*args, **kwargs):
    """
    加载Torch模型的补丁函数。
    
    @param args: 传递给原始torch.load函数的位置参数。
    @param kwargs: 传递给原始torch.load函数的关键字参数。
    @return: 调用原始torch.load函数的结果。
    """
    # 设置weights_only为False，确保加载完整的模型，而不仅仅是权重。
    kwargs['weights_only'] = False
    # 调用原始的torch.load函数并返回其结果。
    return original_torch_load(*args, **kwargs)


torch.load = patched_torch_load
model = YOLO(r"B:\code\ultralytics-8.0.5\best.pt")

# 鱼类标签中英文映射
fish_labels = {
    "AngelFish": "神仙鱼",
    "BlueTang": "蓝吊",
    "ButterflyFish": "蝶鱼",
    "ClownFish": "小丑鱼",
    "GoldFish": "金鱼",
    "Gourami": "丝足鱼",
    "MorishIdol": "神像鱼",
    "PlatyFish": "月光鱼",
    "RibbonedSweetlips": "带纹胡椒鲷",
    "ThreeStripedDamselfish": "三间雀",
    "YellowCichlid": "黄色慈鲷",
    "YellowTang": "黄三角吊",
    "ZebraFish": "斑马鱼"
}

# 简单的用户存储（实际应用中应使用数据库）
fake_users_db = {
    "user": {
        "username": "user",
        "password": "user123"
    }
}

# 新增数据统计变量
# 图像相关统计
total_image_detections = 0
today_image_detections = 0
total_image_alerts = 0
today_image_alerts = 0
# 视频相关统计
total_video_detections = 0
today_video_detections = 0
total_video_alerts = 0
today_video_alerts = 0
question_answer_count = 0

# 记录当天日期，用于判断是否是当天
current_date = datetime.now().date()


class ConnectionManager:
    def __init__(self):
        """
        初始化方法，用于创建类的实例。
        """
        # 初始化一个空的WebSocket连接列表，用于存储活跃的WebSocket连接
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        """
        处理WebSocket连接的异步方法。
    
        @param websocket: 表示WebSocket连接的对象。
        """
        # 接受WebSocket连接请求
        await websocket.accept()
        # 将新的WebSocket连接添加到活动连接列表中
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        """
        断开与指定WebSocket的连接。
    
        @param websocket: 需要断开连接的WebSocket对象。
        """
        # 从活动连接列表中移除指定的WebSocket对象
        self.active_connections.remove(websocket)

    async def send_json(self, message: dict, websocket: WebSocket):
        """
        异步发送JSON消息到WebSocket连接。
    
        @param message: 要发送的JSON格式的消息，类型为字典。
        @param websocket: WebSocket连接对象，用于发送消息。
        """
        # 使用websocket对象的send_json方法异步发送JSON消息
        await websocket.send_json(message)

    async def broadcast_alert(self, message: dict):
        """
        广播警报消息给所有活跃的连接。
    
        @param self: 当前对象的实例。
        @param message: 要发送的消息，类型为字典。
        """
        for connection in self.active_connections:
            # 遍历所有活跃的连接
            await connection.send_json(message)
            # 异步发送JSON格式的消息到当前连接


manager = ConnectionManager()


def save_log_entry(entry: dict):
    """
    保存日志条目到指定的日志文件中。如果文件不存在，则创建文件并写入初始条目；
    如果文件存在，则追加新的日志条目。

    参数:
    entry (dict): 要保存的日志条目，以字典形式表示。
    """
    try:
        # 检查日志文件是否存在
        if not os.path.exists(LOG_FILE):
            # 获取日志文件所在的目录路径
            log_dir = os.path.dirname(LOG_FILE)
            # 如果目录不存在，则创建目录
            if not os.path.exists(log_dir):
                os.makedirs(log_dir)
            # 以写模式打开日志文件，并写入初始条目
            with open(LOG_FILE, "w", encoding="utf-8") as f:
                json.dump([entry], f, ensure_ascii=False, indent=2)
            print(f"成功创建并写入日志文件: {LOG_FILE}")
        else:
            # 以读写模式打开已存在的日志文件
            with open(LOG_FILE, "r+", encoding="utf-8") as f:
                try:
                    # 尝试读取现有的日志条目
                    logs = json.load(f)
                    # 如果读取的内容不是列表，则初始化为空列表
                    if not isinstance(logs, list):
                        logs = []
                except json.JSONDecodeError:
                    # 如果读取过程中发生JSON解码错误，则初始化为空列表
                    logs = []
                # 将新的日志条目追加到现有日志列表中
                logs.append(entry)
                # 将文件指针移动到文件开头
                f.seek(0)
                # 将更新后的日志列表写回文件
                json.dump(logs, f, ensure_ascii=False, indent=2)
                # 截断文件，删除多余的内容
                f.truncate()
            print(f"成功追加日志到文件: {LOG_FILE}")
    except Exception as e:
        # 捕获所有异常并打印错误信息
        print(f"保存日志文件时出错: {e}")


def authenticate_user(credentials: HTTPBasicCredentials = Depends(security)):
    """
    验证用户身份的函数。

    @param credentials: HTTP基本认证凭据，默认为依赖注入的安全模块提供的凭据。
    @type credentials: HTTPBasicCredentials
    @return: 返回用户名字符串。
    @rtype: str
    @raises HTTPException: 如果用户名或密码无效，则抛出HTTP异常。
    """
    # 从假数据库中获取用户信息
    user = fake_users_db.get(credentials.username)
    
    # 检查用户是否存在以及密码是否匹配
    if user is None or user["password"] != credentials.password:
        # 如果用户不存在或密码不匹配，抛出401未授权异常
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password",
            headers={"WWW - Authenticate": "Basic"},
        )
    
    # 返回用户名
    return credentials.username


def draw_boxes(frame, detections, threshold):
    """
    在图像上绘制检测框和标签。

    @param frame: 输入的图像帧，BGR格式。
    @param detections: 包含检测信息的列表，每个元素是一个字典，包含bbox、confidence和fish_cn。
    @param threshold: 置信度阈值，低于该值的检测框用红色绘制，高于该值的用绿色绘制。
    @return: 带有绘制检测框和标签的图像帧，BGR格式。
    """
    # 将图像从BGR格式转换为RGB格式
    frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    # 将NumPy数组转换为PIL图像对象
    pil_image = Image.fromarray(frame)
    # 创建一个ImageDraw对象用于在图像上绘制
    draw = ImageDraw.Draw(pil_image)
    # 加载字体文件，设置字体大小为20
    font = ImageFont.truetype("simhei.ttf", 20)

    # 遍历每一个检测信息
    for detection in detections:
        # 获取检测框的坐标
        x1, y1, x2, y2 = detection["bbox"]
        # 获取检测的置信度
        conf = detection["confidence"]
        # 获取检测的标签
        label = detection["fish_cn"]
        # 根据置信度确定绘制的颜色
        if conf < threshold:
            color = (255, 0, 0)  # 置信度低于阈值时使用红色
        else:
            color = (0, 255, 0)  # 置信度高于阈值时使用绿色
        # 绘制矩形框
        draw.rectangle([x1, y1, x2, y2], outline=color, width=2)
        # 生成显示的文本内容
        text = f"{label}: {conf:.2f}"
        # 在矩形框上方绘制文本
        draw.text((x1, y1 - 20), text, fill=color, font=font)

    # 将PIL图像转换回NumPy数组，并从RGB格式转换为BGR格式
    frame = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
    # 返回处理后的图像帧
    return frame


@app.websocket("/ws/fish-detection")
async def websocket_endpoint(websocket: WebSocket):
    """
    处理WebSocket连接的异步端点函数。
    
    @param websocket: 客户端的WebSocket连接对象。
    """
    global total_image_detections, today_image_detections, total_image_alerts, today_image_alerts
    global total_video_detections, today_video_detections, total_video_alerts, today_video_alerts
    # 连接到WebSocket管理器
    await manager.connect(websocket)
    try:
        while True:
            # 接收来自客户端的字节数据
            data = await websocket.receive_bytes()
            # 将字节数据转换为NumPy数组
            nparr = np.frombuffer(data, np.uint8)
            # 解码图像帧
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            # 使用模型进行预测
            results = model(frame)

            detections = []
            alert_count = 0
            threshold = 0.5
            # 遍历检测结果
            for result in results:
                for box in result.boxes:
                    # 提取边界框坐标和置信度
                    x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                    conf = float(box.conf[0])
                    cls = int(box.cls[0])
                    label = result.names[cls]

                    # 添加检测到的对象信息到列表中
                    detections.append({
                        "bbox": [x1, y1, x2, y2],
                        "confidence": conf,
                        "fish_en": label,
                        "fish_cn": fish_labels.get(label, label)
                    })

                    # 如果置信度低于阈值，增加警告计数
                    if conf < threshold:
                        alert_count += 1

            # 更新总图像检测次数
            total_image_detections += len(detections)
            if datetime.now().date() == current_date:
                # 更新当天图像检测次数
                today_image_detections += len(detections)

            # 更新总图像警告次数
            total_image_alerts += alert_count
            if datetime.now().date() == current_date:
                # 更新当天图像警告次数
                today_image_alerts += alert_count

            # 如果有警告，广播警告信息
            if alert_count > 0:
                await manager.broadcast_alert({"alert": f"识别度低于阈值的目标数: {alert_count}"})

            # 在图像上绘制边界框
            frame_with_boxes = draw_boxes(frame, detections, threshold)
            # 编码图像为JPEG格式
            _, buffer = cv2.imencode('.jpg', frame_with_boxes)
            # 将图像转换为字节数组
            frame_bytes = buffer.tobytes()
            # 将字节数组编码为Base64字符串
            frame_base64 = base64.b64encode(frame_bytes).decode('utf - 8')

            # 发送包含状态、检测信息和图像的JSON响应给客户端
            await manager.send_json({
                "status": "success",
                "detections": detections,
                "frame": frame_base64
            }, websocket)

    except WebSocketDisconnect:
        # 处理客户端断开连接的情况
        manager.disconnect(websocket)
        print("Client disconnected")


# Ollama API 调用函数
def generate_response(prompt: str, model: str = "deepseek - r1:8b", stream: bool = False):
    """
    生成响应文本的函数。

    @param prompt: 输入提示文本，用于生成响应。
    @type prompt: str
    @param model: 使用的模型名称，默认为 "deepseek - r1:8b"。
    @type model: str
    @param stream: 是否使用流式传输，默认为 False。
    @type stream: bool
    @return: 返回生成的响应文本。
    @rtype: str
    @raises HTTPException: 当请求失败或发生错误时抛出异常。
    """
    # API 请求的 URL
    url = "http://localhost:11434/api/generate"
    # 请求头信息，指定内容类型为 JSON
    headers = {"Content - Type": "application/json"}
    # 请求数据，包含模型名称、提示文本和流式传输选项
    data = {
        "model": model,
        "prompt": prompt,
        "stream": stream
    }

    try:
        # 发送 POST 请求到指定的 URL，并附带请求数据和头信息
        response = requests.post(url, json=data, headers=headers)
        # 如果响应状态码为 200，表示请求成功
        if response.status_code == 200:
            # 从响应中提取生成的文本，并去除首尾空白字符
            result_text = response.json().get("response", "").strip()
            # 返回生成的文本
            return result_text
        else:
            # 如果响应状态码不是 200，抛出 HTTP 异常，并附带状态码和错误详情
            raise HTTPException(status_code=response.status_code, detail="Ollama API 请求失败")
    except Exception as e:
        # 捕获所有异常，抛出 HTTP 异常，并附带状态码和错误详情
        raise HTTPException(status_code=500, detail=f"调用 Ollama API 时发生错误: {str(e)}")


# 创建一个新的问答接口
from pydantic import BaseModel


class Question(BaseModel):
    prompt: str
    deep_thinking: bool = False


@app.post("/ask - question")
async def ask_question(question: Question):
    """
    异步函数，用于处理问题并生成回答。
    
    @param question: 包含问题信息的对象
    @type question: Question
    @return: 包含回答或错误信息的字典
    @rtype: dict
    """
    global question_answer_count  # 使用全局变量来记录回答的数量
    try:
        if question.deep_thinking:  # 如果问题需要深度思考模式
            prompt = f"[深度思考模式] {question.prompt}"  # 在提示中添加深度思考模式的标记
        else:
            prompt = question.prompt  # 否则直接使用问题的提示

        answer = generate_response(prompt)  # 调用生成回答的函数
        question_answer_count += 1  # 增加回答计数
        return {"response": answer}  # 返回包含回答的字典
    except Exception as e:  # 捕获所有异常
        return {"error": str(e)}  # 返回包含错误信息的字典


# 新增获取数据看板信息的接口
@app.get("/dashboard")
async def get_dashboard_info():
    """
    获取仪表盘信息的异步函数。
    
    @return: 包含各种检测和警报计数的字典。
    @rtype: dict
    """
    # 使用全局变量来存储图像和视频的检测和警报总数以及今日的计数
    global total_image_detections, today_image_detections, total_image_alerts, today_image_alerts
    global total_video_detections, today_video_detections, total_video_alerts, today_video_alerts
    global question_answer_count
    
    # 返回一个包含所有相关计数的字典
    return {
        "total_image_detections": total_image_detections,  # 总图像检测数
        "today_image_detections": today_image_detections,  # 今日图像检测数
        "total_image_alerts": total_image_alerts,          # 总图像警报数
        "today_image_alerts": today_image_alerts,          # 今日图像警报数
        "total_video_detections": total_video_detections,  # 总视频检测数
        "today_video_detections": today_video_detections,  # 今日视频检测数
        "total_video_alerts": total_video_alerts,          # 总视频警报数
        "today_video_alerts": today_video_alerts,          # 今日视频警报数
        "question_answer_count": question_answer_count     # 问答计数
    }


@app.post("/upload/image")
async def upload_image(
        file: bytes = File(...)
):
    """
    处理上传的图片，进行目标检测并返回检测结果和标记后的图片。

    @param file: 上传的图片文件，以字节流形式传入
    @return: 包含检测结果和标记后图片的字典
    """
    global total_image_detections, today_image_detections, total_image_alerts, today_image_alerts
    try:
        # 将字节流转换为NumPy数组
        nparr = np.frombuffer(file, np.uint8)
        # 使用OpenCV解码图像
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        # 如果图像无法解码，抛出HTTP异常
        if image is None:
            raise HTTPException(400, "无法解码图片")

        # 使用模型对图像进行目标检测
        results = model(image)

        detections = []
        alert_count = 0
        threshold = 0.5
        # 遍历检测结果
        for result in results:
            for box in result.boxes:
                # 获取边界框坐标和置信度
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                conf = float(box.conf[0])
                cls = int(box.cls[0])
                label = result.names[cls]

                # 将检测结果添加到列表中
                detections.append({
                    "bbox": [x1, y1, x2, y2],
                    "confidence": conf,
                    "fish_en": label,
                    "fish_cn": fish_labels.get(label, label)
                })

                # 如果置信度低于阈值，增加警告计数
                if conf < threshold:
                    alert_count += 1

        # 更新全局检测计数器
        total_image_detections += len(detections)
        if datetime.now().date() == current_date:
            today_image_detections += len(detections)

        # 更新全局警告计数器
        total_image_alerts += alert_count
        if datetime.now().date() == current_date:
            today_image_alerts += alert_count

        # 如果有警告，广播警告信息
        if alert_count > 0:
            await manager.broadcast_alert({"alert": f"识别度低于阈值的目标数: {alert_count}"})

        # 在图像上绘制边界框
        image_with_boxes = draw_boxes(image, detections, threshold)
        # 编码图像为JPEG格式
        _, buffer = cv2.imencode('.jpg', image_with_boxes)
        image_bytes = buffer.tobytes()
        # 将图像转换为Base64编码字符串
        image_base64 = base64.b64encode(image_bytes).decode('utf - 8')

        # 保存标记好的图片到 images 目录
        image_save_path = os.path.join(IMAGES_DIR, f"{datetime.now().strftime('%Y%m%d%H%M%S')}.jpg")
        with open(image_save_path, 'wb') as f:
            f.write(image_bytes)

        # 保存图片检测记录
        log_entry = {
            "type": "image",
            "timestamp": datetime.now().strftime("%Y - %m - %d %H:%M:%S"),
            "detections": detections,
            "alert_count": alert_count,
            "marked_image_path": image_save_path
        }
        save_log_entry(log_entry)

        # 返回成功状态、检测结果和标记后的图片
        return {
            "status": "success",
            "detections": detections,
            "image": image_base64
        }

    except Exception as e:
        # 捕获异常并抛出HTTP异常
        raise HTTPException(500, f"处理图片时发生错误: {str(e)}")


@app.post("/upload/video")
async def upload_video(
        file: bytes = File(...)
):
    """
    处理上传的视频文件，进行目标检测并记录检测结果。

    @param file: 上传的视频文件，类型为字节流。
    @return: 包含处理结果的字典，包括状态、帧数、FPS、检测结果和视频帧数据。
    """
    global total_video_detections, today_video_detections, total_video_alerts, today_video_alerts
    try:
        # 创建一个临时文件来保存上传的视频文件
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as temp_file:
            temp_file.write(file)
            temp_path = temp_file.name

        # 打开视频文件
        cap = cv2.VideoCapture(temp_path)
        if not cap.isOpened():
            raise HTTPException(400, "无法打开视频文件")

        # 初始化变量
        detections = []
        frame_count = 0
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_alert_count = 0
        threshold = 0.5

        video_frames = []
        # 逐帧读取视频文件
        while cap.isOpened():
            success, frame = cap.read()
            if not success:
                break

            # 每5帧进行一次目标检测
            if frame_count % 5 == 0:
                results = model(frame)

                frame_detections = []
                frame_alert_count = 0
                # 遍历检测结果
                for result in results:
                    for box in result.boxes:
                        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                        conf = float(box.conf[0])
                        cls = int(box.cls[0])
                        label = result.names[cls]

                        # 将检测结果添加到列表中
                        frame_detections.append({
                            "frame": frame_count,
                            "time": frame_count / fps,
                            "bbox": [x1, y1, x2, y2],
                            "confidence": conf,
                            "fish_en": label,
                            "fish_cn": fish_labels.get(label, label)
                        })

                        # 如果置信度低于阈值，增加警告计数
                        if conf < threshold:
                            frame_alert_count += 1

                # 更新全局和当天的检测计数
                detections.extend(frame_detections)
                total_video_detections += len(frame_detections)
                if datetime.now().date() == current_date:
                    today_video_detections += len(frame_detections)

                # 更新全局和当天的警告计数
                total_alert_count += frame_alert_count
                total_video_alerts += frame_alert_count
                if datetime.now().date() == current_date:
                    today_video_alerts += frame_alert_count

                # 如果有警告，广播警告信息
                if frame_alert_count > 0:
                    await manager.broadcast_alert({"alert": f"当前帧识别度低于阈值的目标数: {frame_alert_count}"})

                # 在帧上绘制检测框并编码为base64格式
                frame_with_boxes = draw_boxes(frame, frame_detections, threshold)
                _, buffer = cv2.imencode('.jpg', frame_with_boxes)
                frame_bytes = buffer.tobytes()
                frame_base64 = base64.b64encode(frame_bytes).decode('utf - 8')
                video_frames.append(frame_base64)

            frame_count += 1

        # 如果有警告，广播警告信息
        if total_alert_count > 0:
            await manager.broadcast_alert({"alert": f"视频中识别度低于阈值的总目标数: {total_alert_count}"})

        # 释放视频资源并删除临时文件
        cap.release()
        os.unlink(temp_path)

        # 保存标记好的视频为文件到videos目录
        video_save_path = os.path.join(VIDEOS_DIR, f"{datetime.now().strftime('%Y%m%d%H%M%S')}.mp4")
        if video_frames:
            height, width, _ = cv2.imdecode(np.frombuffer(base64.b64decode(video_frames[0]), np.uint8), cv2.IMREAD_COLOR).shape
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            out = cv2.VideoWriter(video_save_path, fourcc, fps, (width, height))
            for frame_base64 in video_frames:
                frame = cv2.imdecode(np.frombuffer(base64.b64decode(frame_base64), np.uint8), cv2.IMREAD_COLOR)
                out.write(frame)
            out.release()

        # 保存视频检测记录
        log_entry = {
            "type": "video",
            "timestamp": datetime.now().strftime("%Y - %m - %d %H:%M:%S"),
            "detections": detections,
            "total_alert_count": total_alert_count,
            "total_frames": frame_count,
            "fps": fps,
            "marked_video_path": video_save_path if video_frames else None
        }
        save_log_entry(log_entry)

        # 返回处理结果
        return {
            "status": "success",
            "total_frames": frame_count,
            "fps": fps,
            "detections": detections,
            "video_frames": video_frames
        }

    except Exception as e:
        # 如果发生异常，删除临时文件并抛出HTTP异常
        if "temp_path" in locals() and os.path.exists(temp_path):
            os.unlink(temp_path)
        raise HTTPException(500, f"处理视频时发生错误: {str(e)}")

app.mount("/history_logs", StaticFiles(directory="history_logs"), name="history_logs")
@app.get("/history")
async def get_history(
    start_time: str = Query(None),
    end_time: str = Query(None),
    user: str = Query(None),
    type: str = Query(None)
):
    """
    获取历史记录的异步函数。

    @param start_time: 起始时间，格式为"YYYY-MM-DD HH:MM:SS"
    @param end_time: 结束时间，格式为"YYYY-MM-DD HH:MM:SS"
    @param user: 用户名
    @param type: 日志类型
    @return: 过滤后的历史记录列表
    """
    # 如果日志文件不存在，返回空列表
    if not os.path.exists(LOG_FILE):
        return []

    # 打开日志文件并读取内容
    with open(LOG_FILE, 'r', encoding='utf-8') as f:
        logs = json.load(f)

    # 初始化过滤后的日志列表
    filtered_logs = logs
    
    # 根据起始时间过滤日志
    if start_time:
        try:
            # 将起始时间字符串转换为datetime对象
            start_dt = datetime.strptime(start_time, "%Y-%m-%d %H:%M:%S")
            # 过滤出时间大于等于起始时间的日志
            filtered_logs = [log for log in filtered_logs if datetime.strptime(log["timestamp"], "%Y-%m-%d %H:%M:%S") >= start_dt]
        except ValueError:
            # 如果起始时间格式错误，抛出HTTP异常
            raise HTTPException(400, "start_time格式错误，应为YYYY-MM-DD HH:MM:SS")
    
    # 根据结束时间过滤日志
    if end_time:
        try:
            # 将结束时间字符串转换为datetime对象
            end_dt = datetime.strptime(end_time, "%Y-%m-%d %H:%M:%S")
            # 过滤出时间小于等于结束时间的日志
            filtered_logs = [log for log in filtered_logs if datetime.strptime(log["timestamp"], "%Y-%m-%d %H:%M:%S") <= end_dt]
        except ValueError:
            # 如果结束时间格式错误，抛出HTTP异常
            raise HTTPException(400, "end_time格式错误，应为YYYY-MM-DD HH:MM:SS")
    
    # 根据用户名过滤日志
    if user:
        filtered_logs = [log for log in filtered_logs if log["user"] == user]
    
    # 根据日志类型过滤日志
    if type:
        filtered_logs = [log for log in filtered_logs if log["type"] == type]

    # 处理过滤后的日志，生成对应的URL
    for log in filtered_logs:
        if log["type"] == "image" and "marked_image_path" in log:
            # 为图片类型的日志生成图片URL
            log["image_url"] = f"http://127.0.0.1:8000/{log['marked_image_path'].replace('\\', '/')}"
        elif log["type"] == "video" and "marked_video_path" in log:
            # 去除重复的 history_logs 前缀
            path = log["marked_video_path"]
            if path.startswith("history_logs/"):
                path = path[len("history_logs/"):]
            # 确保路径使用正斜杠
            path = path.replace('\\', '/')
            # 为视频类型的日志生成视频URL
            log["video_url"] = f"http://127.0.0.1:8000/{path}"
            print(f"返回给前端的视频路径: {log['video_url']}")
        else:
            # 对于其他类型的日志，设置URL为None
            log["image_url"] = None
            log["video_url"] = None

    # 返回过滤后的日志列表
    return filtered_logs

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
