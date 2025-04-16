/**
 * 历史记录管理模块
 * 负责图像/视频检测历史记录的获取、展示及权限管理
 */

import { AuthService } from './auth.js';

// ========================
// 权限验证与路由控制
// ========================
// 验证用户访问权限（用户和管理员可访问）
if (!AuthService.checkPermission([AuthService.roles.USER, AuthService.roles.ADMIN])) {
    window.location.href = '../html/login.html';
}

// ========================
// 数据获取层
// ========================
/**
 * 获取历史记录数据
 * @param {'image' | 'video'} type - 记录类型
 * @returns {Promise<Array>} 历史记录数组
 */
async function fetchHistory(type) {
    try {
        const response = await fetch(`http://127.0.0.1:8000/history?type=${type}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('获取历史记录失败:', error);
        return []; // 返回空数组保证页面正常渲染
    }
}

// ========================
// 视图渲染层
// ========================
/**
 * 渲染图片检测历史记录
 * @param {string} tableBodyId - 表格tbody元素ID
 */
async function displayImageHistory(tableBodyId) {
    const historyTableBody = document.getElementById(tableBodyId);
    const history = await fetchHistory('image');

    history.forEach((entry, index) => {
        // 创建表格行元素
        const row = document.createElement('tr');
        
        // 序号列
        const serialNumber = document.createElement('td');
        serialNumber.textContent = index + 1;

        // 检测类型列
        const detectionType = document.createElement('td');
        detectionType.textContent = entry.type || '无';

        // 时间戳列
        const time = document.createElement('td');
        time.textContent = entry.timestamp || '无';

        // 目标数量列
        const targetCount = document.createElement('td');
        targetCount.textContent = entry.detections?.length || 0;

        // 图片预览列
        const imageCell = document.createElement('td');
        if (entry.image_url) {
            const img = document.createElement('img');
            img.src = entry.image_url;
            Object.assign(img.style, {
                maxWidth: '200px',
                maxHeight: '200px',
                objectFit: 'contain'
            });
            imageCell.appendChild(img);
        } else {
            imageCell.textContent = '无图片';
        }

        // 组装表格行
        row.append(serialNumber, detectionType, time, targetCount, imageCell);
        historyTableBody.appendChild(row);
    });
}

/**
 * 渲染视频检测历史记录
 * @param {string} tableBodyId - 表格tbody元素ID 
 */
async function displayVideoHistory(tableBodyId) {
    const historyTableBody = document.getElementById(tableBodyId);
    const history = await fetchHistory('video');

    history.forEach((entry, index) => {
        const row = document.createElement('tr');
        
        // 公共列创建（序号、类型、时间、数量）
        const serialNumber = document.createElement('td');
        serialNumber.textContent = index + 1;

        const detectionType = document.createElement('td');
        detectionType.textContent = entry.type || '无';

        const time = document.createElement('td');
        time.textContent = entry.timestamp || '无';

        const targetCount = document.createElement('td');
        targetCount.textContent = entry.detections?.length || 0;

        // 视频记录无图片列
        row.append(serialNumber, detectionType, time, targetCount);
        historyTableBody.appendChild(row);
    });
}

// ========================
// 页面初始化逻辑
// ========================
window.onload = async () => {
    // 验证会话状态
    const user = AuthService.getCurrentUser();
    if (!user) {
        AuthService.logout();
        return;
    }

    // 动态配置返回按钮
    const backBtn = document.getElementById('backBtn');
    const isAdmin = user.role === AuthService.roles.ADMIN;
    backBtn.textContent = isAdmin ? '返回管理看板' : '返回用户主页';
    backBtn.onclick = () => {
        window.location.href = isAdmin ? './admin.html' : '../index.html';
    };

    // 并行加载历史数据
    await Promise.all([
        displayImageHistory('imageHistoryTableBody'),
        displayVideoHistory('videoHistoryTableBody')
    ]);
};