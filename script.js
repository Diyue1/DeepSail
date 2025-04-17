// ==================== 全局变量 ====================
var centerMap, leftMap, amapPolyline = null;
var routePoints = [];
var weatherMap = null;
var currentWeatherData = null;
var lastWeatherUpdateTime = null;
var shipMarker = null;
var shipPositionIndex = 0;
var shipAnimation = null;

// ==================== 主初始化函数 ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('系统初始化开始...');
    initUIEvents();
    initLeftMap();
    initCenterMap();
    initRouteScroller();
    initWeatherSystem();
    initPortSwitcher();
    console.log('系统初始化完成');
});

// ==================== 高德天气系统 ====================
function initWeatherSystem() {
    console.log('初始化天气系统...');
    
    if (typeof AMap === 'undefined') {
        console.error('高德地图API加载失败');
        showError('地图服务加载失败，请刷新页面重试');
        return;
    }
    
    console.log('高德地图API加载成功');
    
    try {
        weatherMap = new AMap.Map('weatherMap', {
            resizeEnable: true,
            zoom: 10,
            center: [121.4737, 31.2304]
        });
        console.log('天气地图初始化成功');
    } catch (e) {
        console.error('初始化地图失败:', e);
        showError('地图初始化失败');
        return;
    }
    
    AMap.plugin('AMap.Weather', function() {
        console.log('天气插件加载成功');
        
        try {
            const weather = new AMap.Weather();
            let lastUpdateTime = 0;
            let lastPosition = null;
            
            // 初始获取天气信息
            updateWeatherBasedOnShipPosition(weather);
            
            // 每30秒检查是否需要更新天气
            setInterval(function() {
                const now = Date.now();
                if (!shipMarker) return;
                
                const currentPosition = shipMarker.getPosition();
                if (!currentPosition) return;
                
                // 检查位置是否变化或超过30秒未更新
                const positionChanged = !lastPosition || 
                    currentPosition.lng !== lastPosition.lng || 
                    currentPosition.lat !== lastPosition.lat;
                
                const timeElapsed = now - lastUpdateTime >= 30000;
                
                if (positionChanged || timeElapsed) {
                    updateWeatherBasedOnShipPosition(weather);
                    lastPosition = currentPosition;
                    lastUpdateTime = now;
                }
            }, 5000); // 每5秒检查一次
            
            // 每分钟更新时间显示
            setInterval(updateWeatherTime, 60000);
        } catch (e) {
            console.error('天气插件初始化失败:', e);
            showError('天气服务初始化失败');
        }
    });
}

// 节流函数防止频繁调用
function throttle(func, wait) {
    let lastTime = 0;
    return function() {
        const now = Date.now();
        if (now - lastTime >= wait) {
            func.apply(this, arguments);
            lastTime = now;
        }
    };
}

// 更新天气（带节流）
const throttledWeatherUpdate = throttle(function(weather) {
    updateWeatherBasedOnShipPosition(weather);
}, 30000); // 30秒节流

// 根据船舶位置更新天气
function updateWeatherBasedOnShipPosition(weather) {
    if (!shipMarker) {
        console.log('船舶标记未初始化，无法获取位置');
        return;
    }
    
    const position = shipMarker.getPosition();
    if (!position) {
        console.log('无法获取船舶当前位置');
        return;
    }
    
    console.log('根据船舶位置获取天气:', position);
    
    // 使用逆地理编码获取当前位置的城市名称
    AMap.plugin('AMap.Geocoder', function() {
        const geocoder = new AMap.Geocoder({
            radius: 1000, // 范围半径
            extensions: 'all'
        });
        
        geocoder.getAddress(position, function(status, result) {
            if (status === 'complete' && result.regeocode) {
                const address = result.regeocode;
                let city = address.addressComponent.city || address.addressComponent.province;
                
                if (!city) {
                    // 如果无法获取城市名称，使用经纬度直接查询
                    city = position.lng + ',' + position.lat;
                    console.log('无法获取城市名称，使用经纬度查询:', city);
                }
                
                // 获取天气信息
                weather.getLive(city, function(err, data) {
                    console.log('天气查询结果:', err, data);
                    if (err) {
                        console.error('获取天气数据失败:', err);
                        showError('获取天气数据失败，将使用默认数据');
                        
                        // 使用默认数据作为后备
                        const now = new Date();
                        data = {
                            weather: "晴",
                            temperature: "12",
                            windDirection: "东北风",
                            windPower: "3级",
                            humidity: "65",
                            reportTime: now.toString(),
                            city: city || '当前位置'
                        };
                    }
                    
                    // 保存当前天气数据
                    currentWeatherData = data;
                    lastWeatherUpdateTime = new Date();
                    
                    // 更新天气显示
                    updateWeatherDisplay(data);
                });
            } else {
                console.error('逆地理编码失败:', status, result);
                // 直接使用经纬度查询天气
                weather.getLive(position.lng + ',' + position.lat, function(err, data) {
                    if (err) {
                        console.error('获取天气数据失败:', err);
                        showError('获取天气数据失败，将使用默认数据');
                        
                        const now = new Date();
                        data = {
                            weather: "晴",
                            temperature: "12",
                            windDirection: "东北风",
                            windPower: "3级",
                            humidity: "65",
                            reportTime: now.toString(),
                            city: '当前位置'
                        };
                    }
                    
                    currentWeatherData = data;
                    lastWeatherUpdateTime = new Date();
                    updateWeatherDisplay(data);
                });
            }
        });
    });
}

function updateWeatherTime() {
    if (currentWeatherData) {
        const timeElement = document.getElementById('weatherTime');
        if (timeElement) {
            timeElement.textContent = formatTime(currentWeatherData.reportTime);
        }
    }
}

// 更新天气显示（优化版）
function updateWeatherDisplay(data) {
    try {
        const now = new Date();
        document.getElementById('weatherTime').textContent = formatTime(now);
        
        // 更新位置和天气
        const weatherDesc = document.getElementById('weatherDesc');
        weatherDesc.textContent = `${data.weather} @ ${data.city}`;
        
        // 更新其他天气信息
        document.getElementById('weatherIcon').src = getWeatherIconSVG(getWeatherIcon(data.weather));
        document.getElementById('weatherTemp').textContent = data.temperature + '°C';
        document.getElementById('weatherHumidity').textContent = data.humidity + '%';
        
        const visibility = data.visibility ? 
            (data.visibility / 1000).toFixed(1) + '公里' : 
            estimateVisibility(data.weather);
        document.getElementById('weatherVisibility').textContent = visibility;
        
        document.getElementById('weatherPressure').textContent = (data.pressure || '1012') + ' hPa';
        
        updateWindDisplay(data);
        clearError();
    } catch (e) {
        console.error('更新天气显示时出错:', e);
        showError('天气显示更新失败');
    }
}


function updateWindDisplay(data) {
    try {
        // 更新风向
        const windDirection = data.windDirection || '北风';
        document.getElementById('windDirection').textContent = windDirection;
        
        // 计算风向角度
        const windDegree = convertWindDirection(windDirection);
        document.getElementById('windDegree').textContent = windDegree + '°';
        
        // 更新风向指针
        document.getElementById('windArrow').style.transform = 'rotate(' + windDegree + 'deg)';
        
        // 更新风速
        const windSpeed = convertWindPower(data.windPower || '3级');
        document.getElementById('windSpeed').textContent = windSpeed;
        
        // 更新风速计指针
        document.getElementById('speedNeedle').style.transform = 'rotate(' + (windSpeed * 30) + 'deg)';
        
        // 更新浪高
        const waveHeight = estimateWaveHeight(windSpeed);
        document.querySelector('.wave_value').textContent = waveHeight;
    } catch (e) {
        console.error('更新风向风速显示时出错:', e);
    }
}

function showError(message) {
    try {
        const errorElement = document.getElementById('weatherError');
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
        }
        
        const descElement = document.getElementById('weatherDesc');
        if (descElement) {
            descElement.textContent = '数据获取失败';
            descElement.style.color = '#e74c3c';
        }
    } catch (e) {
        console.error('显示错误信息时出错:', e);
    }
}

function clearError() {
    try {
        const errorElement = document.getElementById('weatherError');
        if (errorElement) {
            errorElement.style.display = 'none';
        }
        
        const descElement = document.getElementById('weatherDesc');
        if (descElement) {
            descElement.style.color = '';
        }
    } catch (e) {
        console.error('清除错误信息时出错:', e);
    }
}

function getWeatherIcon(weather) {
    const iconMap = {
        '晴': 'sunny',
        '多云': 'cloudy',
        '阴': 'overcast',
        '雨': 'rain',
        '阵雨': 'rain',
        '雷阵雨': 'thunder',
        '雷阵雨伴有冰雹': 'thunder',
        '小雨': 'light-rain',
        '中雨': 'moderate-rain',
        '大雨': 'heavy-rain',
        '暴雨': 'storm',
        '大暴雨': 'storm',
        '特大暴雨': 'storm',
        '冻雨': 'sleet',
        '雪': 'snow',
        '阵雪': 'snow',
        '小雪': 'light-snow',
        '中雪': 'moderate-snow',
        '大雪': 'heavy-snow',
        '暴雪': 'blizzard',
        '雾': 'fog',
        '霾': 'haze',
        '扬沙': 'sand',
        '浮尘': 'dust',
        '沙尘暴': 'sandstorm'
    };
    
    // 尝试匹配完整天气描述
    if (iconMap[weather]) {
        return iconMap[weather];
    }
    
    // 尝试匹配包含关键词
    for (const key in iconMap) {
        if (weather.includes(key)) {
            return iconMap[key];
        }
    }
    
    return 'default';
}

function getWeatherIconSVG(weatherType) {
    const icons = {
        'sunny': `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='30' fill='#FFD43B'/><circle cx='50' cy='50' r='25' fill='#FFEE99'/></svg>`,
        'cloudy': `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='M75 50 A25 15 0 1 1 25 50 A25 15 0 1 1 75 50' fill='#DEE2E6'/><circle cx='50' cy='50' r='20' fill='#DEE2E6'/></svg>`,
        'overcast': `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect x='10' y='50' width='80' height='20' fill='#ADB5BD'/><path d='M10 50 Q30 40 50 50 T90 50' fill='none' stroke='#ADB5BD' stroke-width='10'/></svg>`,
        'rain': `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='M75 50 A25 15 0 1 1 25 50 A25 15 0 1 1 75 50' fill='#DEE2E6'/><circle cx='50' cy='50' r='20' fill='#DEE2E6'/><path d='M40 70 L40 80 M50 65 L50 80 M60 70 L60 80' stroke='#4DABF7' stroke-width='2'/></svg>`,
        'thunder': `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='M75 50 A25 15 0 1 1 25 50 A25 15 0 1 1 75 50' fill='#343A40'/><circle cx='50' cy='50' r='20' fill='#343A40'/><path d='M45 40 L35 60 L55 50 L40 70' fill='none' stroke='#FFD43B' stroke-width='3' stroke-linejoin='round'/></svg>`,
        'default': `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='40' fill='none' stroke='#4DABF7' stroke-width='8'/><circle cx='50' cy='50' r='30' fill='none' stroke='#4DABF7' stroke-width='8' stroke-dasharray='15,10'/></svg>`
    };
    
    const svg = icons[weatherType] || icons['default'];
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function convertWindDirection(direction) {
    const directionMap = {
        '北风': 0,
        '东北风': 45,
        '东风': 90,
        '东南风': 135,
        '南风': 180,
        '西南风': 225,
        '西风': 270,
        '西北风': 315,
        '静风': 0
    };
    
    if (directionMap[direction]) {
        return directionMap[direction];
    }
    
    if (direction.includes('北') && direction.includes('东')) return 45;
    if (direction.includes('东') && direction.includes('南')) return 135;
    if (direction.includes('南') && direction.includes('西')) return 225;
    if (direction.includes('西') && direction.includes('北')) return 315;
    if (direction.includes('北')) return 0;
    if (direction.includes('东')) return 90;
    if (direction.includes('南')) return 180;
    if (direction.includes('西')) return 270;
    
    return 0;
}

function convertWindPower(power) {
    if (!power) return 3;
    
    // 处理"3-4级"这样的格式
    const rangeMatch = power.match(/(\d+)\s*-\s*(\d+)/);
    if (rangeMatch) {
        return (parseInt(rangeMatch[1]) + parseInt(rangeMatch[2])) / 2;
    }
    
    // 处理"3级"这样的格式
    const singleMatch = power.match(/(\d+)/);
    return singleMatch ? parseInt(singleMatch[1]) : 3;
}

function estimateVisibility(weather) {
    if (!weather) return '10海里以上';
    
    if (weather.includes('雾') || weather.includes('霾') || weather.includes('沙尘')) {
        return '1-3海里';
    }
    if (weather.includes('暴雨') || weather.includes('大雪')) {
        return '3-5海里';
    }
    if (weather.includes('雨') || weather.includes('雪')) {
        return '5-8海里';
    }
    return '10海里以上';
}

function estimateWaveHeight(windSpeed) {
    if (windSpeed <= 3) return '0.5-1.0';
    if (windSpeed <= 5) return '1.0-1.5';
    if (windSpeed <= 7) return '1.5-2.5';
    if (windSpeed <= 9) return '2.5-4.0';
    return '4.0以上';
}

function formatTime(date) {
    if (typeof date === 'string') {
        date = new Date(date);
    }
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

// ==================== 左栏高德地图功能 ====================
function initLeftMap() {
    if (typeof AMap === 'undefined') {
        console.error('高德地图API未加载');
        return;
    }

    try {
        leftMap = new AMap.Map('leftMap', {
            viewMode: '2D',
            zoom: 12,
            center: [121.4925, 31.2416], // 上海外滩坐标
            resizeEnable: true,
            showIndoorMap: false
        });

        // 添加地图控件
        leftMap.addControl(new AMap.ToolBar({
            position: 'RB'
        }));
        leftMap.addControl(new AMap.Scale());

        // 创建船舶标记
        createShipMarker(leftMap);
        
        // 地图类型切换
        document.getElementById('switchToSatellite').addEventListener('click', function() {
            leftMap.setMapStyle('amap://styles/satellite');
        });

        document.getElementById('switchToRoadmap').addEventListener('click', function() {
            leftMap.setMapStyle('amap://styles/normal');
        });

        // 定位船舶
        document.getElementById('locateShip').addEventListener('click', function() {
            if (shipMarker) {
                leftMap.setCenter(shipMarker.getPosition());
                leftMap.setZoom(15);
            }
        });
        
        console.log('左栏高德地图初始化成功');
    } catch (e) {
        console.error('左栏高德地图初始化失败:', e);
    }
}

function createShipMarker(map) {
    // 创建船舶图标
    const shipIcon = new AMap.Icon({
        image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M16 2 L30 16 L16 30 L2 16 Z' fill='%23e74c3c'/><circle cx='16' cy='16' r='4' fill='%23fff'/></svg>",
        size: new AMap.Size(32, 32),
        imageOffset: new AMap.Pixel(0, 0),
        imageSize: new AMap.Size(32, 32)
    });
    
    // 创建船舶标记
    shipMarker = new AMap.Marker({
        position: [121.4925, 31.2416], // 初始位置
        icon: shipIcon,
        offset: new AMap.Pixel(-16, -16),
        zIndex: 100,
        map: map
    });
}

// ==================== 中间栏高德地图功能 ====================
function initCenterMap() {
    if (typeof AMap === 'undefined') {
        console.error('高德地图API未加载');
        return;
    }

    try {
        centerMap = new AMap.Map('centerMap', {
            viewMode: '2D',
            zoom: 10,
            center: [121.4737, 31.2304], // 上海坐标
            resizeEnable: true
        });

        // 添加地图控件
        centerMap.addControl(new AMap.ToolBar({
            position: 'RB'
        }));
        centerMap.addControl(new AMap.Scale());

        // 地图点击事件
        centerMap.on('click', function(e) {
            document.getElementById('txtCoord').value = '经度: ' + e.lnglat.lng.toFixed(6) + ', 纬度: ' + e.lnglat.lat.toFixed(6);
        });
        
        console.log('中间栏高德地图初始化成功');
    } catch (e) {
        console.error('中间栏高德地图初始化失败:', e);
    }
}

// ==================== 港口切换功能 ====================
function initPortSwitcher() {
    const portButtons = document.querySelectorAll('.port_btn');
    const portContents = document.querySelectorAll('.port_content');
    
    portButtons.forEach(button => {
        button.addEventListener('click', function() {
            // 移除所有按钮的激活状态
            portButtons.forEach(btn => btn.classList.remove('port_btn_active'));
            // 隐藏所有内容
            portContents.forEach(content => content.classList.remove('active'));
            
            // 添加当前按钮的激活状态
            this.classList.add('port_btn_active');
            // 显示对应的内容
            const port = this.dataset.port;
            document.querySelector(`.port_${port}`).classList.add('active');
        });
    });
}

// ==================== 航线功能 ====================
// 确保经度在 -180 到 180 范围内，并处理跨越经度的情况
function adjustLongitudeForRoute(routePoints) {
    const adjustedPoints = [];
    
    for (let i = 0; i < routePoints.length; i++) {
        const point = routePoints[i];
        
        if (i > 0) {
            const prevPoint = routePoints[i - 1];
            
            // 计算当前点和前一个点的经度差
            let lngDifference = point[0] - prevPoint[0];
            
            // 如果经度差距超过 180 度，进行调整
            if (Math.abs(lngDifference) > 180) {
                // 判断跨越的方向，进行修正
                if (lngDifference > 0) {
                    // 如果经度差距大于 180，表示跨越了国际日期变更线，从 180 到 -180
                    point[0] -= 360; // 经度减去 360，修正为负值
                } else {
                    // 如果经度差距小于 -180，表示跨越了国际日期变更线，从 -180 到 180
                    point[0] += 360; // 经度加上 360，修正为正值
                }
            }
        }
        
        adjustedPoints.push(point);
    }
    
    return adjustedPoints;
}

// 起点和终点映射表（用于标准化输入）
const portMappings = {
    // 中文城市名映射到英文
    "上海港": "shanghai",
    "天津港": "tianjin",
    "广州港": "guangzhou",
    "智利瓦斯科港": "southamerica",
    "日本福冈港": "japan",
    "澳大利亚丹皮尔港": "australia",
    "纽约/新泽西港":"america",
    "托伯莫里港":"england"
};

// 初始化事件监听
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('loadRouteBtn').addEventListener('click', loadRouteFile);
    document.getElementById('loadCustomFileBtn')?.addEventListener('click', openFileDialog);
    
    // 添加输入字段的自动完成建议
    setupAutocomplete();
});

// 设置自动完成建议
function setupAutocomplete() {
    const portNames = Object.keys(portMappings);
    
    const startPortInput = document.getElementById('startPort');
    const endPortInput = document.getElementById('endPort');
    
    // 为起点输入框添加数据列表
    const startDatalist = document.createElement('datalist');
    startDatalist.id = 'startPortOptions';
    
    // 为终点输入框添加数据列表
    const endDatalist = document.createElement('datalist');
    endDatalist.id = 'endPortOptions';
    
    // 向数据列表中添加选项
    portNames.forEach(port => {
        const startOption = document.createElement('option');
        startOption.value = port;
        startDatalist.appendChild(startOption);
        
        const endOption = document.createElement('option');
        endOption.value = port;
        endDatalist.appendChild(endOption);
    });
    
    // 将数据列表添加到文档中
    document.body.appendChild(startDatalist);
    document.body.appendChild(endDatalist);
    
    // 将输入框与数据列表关联
    startPortInput.setAttribute('list', 'startPortOptions');
    endPortInput.setAttribute('list', 'endPortOptions');
}

// 打开文件选择对话框
function openFileDialog() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,.txt,.csv';
    fileInput.style.display = 'none';
    
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const content = e.target.result;
                const fileType = file.name.split('.').pop().toLowerCase();
                const points = parseFileContent(content, fileType);
                
                if (points.length > 0) {
                    drawRoute(points);
                } else {
                    alert('文件中未找到有效的航线数据');
                }
            } catch (error) {
                console.error('文件解析错误:', error);
                alert('文件解析错误: ' + error.message);
            }
        };
        
        reader.readAsText(file);
        document.body.removeChild(fileInput);
    });
    
    document.body.appendChild(fileInput);
    fileInput.click();
}

// 加载航线文件
function loadRouteFile() {
    // 获取输入值并转换为小写
    let startPort = document.getElementById('startPort').value.trim().toLowerCase();
    let endPort = document.getElementById('endPort').value.trim().toLowerCase();
    
    if (!startPort || !endPort) {
        showNotification('请输入起点和终点', 'warning');
        return;
    }
    
    // 映射标准化港口名称
    startPort = portMappings[startPort] || startPort;
    endPort = portMappings[endPort] || endPort;
    
    // 构建可能的文件路径，尝试多种格式
    const possiblePaths = [
        `routes/${startPort}-${endPort}.json`,
        `routes/${startPort}_to_${endPort}.json`,
        `routes/${startPort}_${endPort}.json`,
        `routes/${startPort}2${endPort}.json`
    ];
    
    // 显示加载指示器
    showLoadingIndicator();
    
    // 尝试加载第一个可用的文件
    tryLoadFiles(possiblePaths, 0);
}

// 显示加载指示器
function showLoadingIndicator() {
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'loadingIndicator';
    loadingDiv.style.position = 'fixed';
    loadingDiv.style.top = '50%';
    loadingDiv.style.left = '50%';
    loadingDiv.style.transform = 'translate(-50%, -50%)';
    loadingDiv.style.background = 'rgba(0,0,0,0.7)';
    loadingDiv.style.color = 'white';
    loadingDiv.style.padding = '20px';
    loadingDiv.style.borderRadius = '5px';
    loadingDiv.style.zIndex = '9999';
    loadingDiv.innerHTML = '正在加载航线数据...';
    
    document.body.appendChild(loadingDiv);
}

// 隐藏加载指示器
function hideLoadingIndicator() {
    const loadingDiv = document.getElementById('loadingIndicator');
    if (loadingDiv) {
        document.body.removeChild(loadingDiv);
    }
}

// 显示通知
function showNotification(message, type = 'info') {
    const notificationDiv = document.createElement('div');
    notificationDiv.className = `notification ${type}`;
    notificationDiv.textContent = message;
    notificationDiv.style.position = 'fixed';
    notificationDiv.style.top = '20px';
    notificationDiv.style.right = '20px';
    notificationDiv.style.padding = '10px 20px';
    notificationDiv.style.borderRadius = '5px';
    notificationDiv.style.zIndex = '9999';
    
    // 根据类型设置不同的样式
    switch (type) {
        case 'error':
            notificationDiv.style.background = '#ff4d4f';
            notificationDiv.style.color = 'white';
            break;
        case 'warning':
            notificationDiv.style.background = '#faad14';
            notificationDiv.style.color = 'white';
            break;
        case 'success':
            notificationDiv.style.background = '#52c41a';
            notificationDiv.style.color = 'white';
            break;
        default:
            notificationDiv.style.background = '#1890ff';
            notificationDiv.style.color = 'white';
    }
    
    document.body.appendChild(notificationDiv);
    
    // 3秒后自动消失
    setTimeout(() => {
        if (notificationDiv.parentNode) {
            document.body.removeChild(notificationDiv);
        }
    }, 3000);
}

// 尝试逐个加载文件路径
function tryLoadFiles(paths, index) {
    if (index >= paths.length) {
        hideLoadingIndicator();
        showNotification('没有找到匹配的航线数据', 'warning');
        return;
    }
    
    const path = paths[index];
    
    fetch(path)
        .then(response => {
            if (!response.ok) {
                throw new Error(`无法加载文件: ${path}`);
            }
            return response.json();
        })
        .then(data => {
            hideLoadingIndicator();
            
            let points = parseRouteData(data);
            if (points.length > 0) {
                drawRoute(points);
                showNotification('航线加载成功', 'success');
                
                // 更新输入框显示为标准化名称
                document.getElementById('startPort').value = document.getElementById('startPort').value.trim();
                document.getElementById('endPort').value = document.getElementById('endPort').value.trim();
            } else {
                showNotification('航线数据格式不正确', 'error');
            }
        })
        .catch(error => {
            console.log(`尝试加载 ${path} 失败: ${error.message}`);
            // 尝试下一个路径
            tryLoadFiles(paths, index + 1);
        });
}

// 解析路由数据
function parseRouteData(data) {
    let points = [];
    
    // 尝试多种可能的数据格式
    if (Array.isArray(data)) {
        // 格式1: [[lng,lat], [lng,lat], ...]
        if (data.length > 0 && Array.isArray(data[0])) {
            points = data.filter(isValidCoordinate);
        }
        // 格式2: [{longitude: x, latitude: y}, ...]
        else if (data.length > 0 && typeof data[0] === 'object') {
            points = data.map(point => {
                if (point.longitude !== undefined && point.latitude !== undefined) {
                    return [parseFloat(point.longitude), parseFloat(point.latitude)];
                } else if (point.lng !== undefined && point.lat !== undefined) {
                    return [parseFloat(point.lng), parseFloat(point.lat)];
                } else if (point.lon !== undefined && point.lat !== undefined) {
                    return [parseFloat(point.lon), parseFloat(point.lat)];
                } else if (point[0] !== undefined && point[1] !== undefined) {
                    return [parseFloat(point[0]), parseFloat(point[1])];
                }
                return null;
            }).filter(point => point !== null);
        }
    } else if (typeof data === 'object') {
        // 格式3: {"points": [[lng,lat], ...]} 或 {"coordinates": [[lng,lat], ...]}
        if (data.points) {
            points = data.points.filter(isValidCoordinate);
        } else if (data.coordinates) {
            points = data.coordinates.filter(isValidCoordinate);
        } else if (data.features) {
            // 格式4: GeoJSON格式
            points = extractCoordinatesFromGeoJSON(data);
        } else if (data.route) {
            // 格式5: {"route": [[lng,lat], ...]} 或 {"route": [{longitude: x, latitude: y}, ...]}
            if (Array.isArray(data.route)) {
                if (data.route.length > 0 && Array.isArray(data.route[0])) {
                    points = data.route.filter(isValidCoordinate);
                } else if (data.route.length > 0 && typeof data.route[0] === 'object') {
                    points = data.route.map(point => {
                        if (point.longitude !== undefined && point.latitude !== undefined) {
                            return [parseFloat(point.longitude), parseFloat(point.latitude)];
                        } else if (point.lng !== undefined && point.lat !== undefined) {
                            return [parseFloat(point.lng), parseFloat(point.lat)];
                        } else if (point.lon !== undefined && point.lat !== undefined) {
                            return [parseFloat(point.lon), parseFloat(point.lat)];
                        }
                        return null;
                    }).filter(point => point !== null);
                }
            }
        }
    }
    
    return points;
}

// 解析文件内容（支持多种格式）
function parseFileContent(content, fileType) {
    let points = [];
    
    switch (fileType) {
        case 'json':
            points = parseJsonFile(content);
            break;
        case 'txt':
        case 'csv':
            points = parseTextFile(content);
            break;
        default:
            throw new Error('不支持的文件格式');
    }
    
    return points;
}

// 解析JSON文件
function parseJsonFile(content) {
    const data = JSON.parse(content);
    let points = [];
    
    if (Array.isArray(data)) {
        // 格式1: [[lng,lat], [lng,lat], ...]
        points = data.filter(isValidCoordinate);
    } else if (data.points || data.coordinates) {
        // 格式2: {"points": [[lng,lat], ...]}
        points = (data.points || data.coordinates).filter(isValidCoordinate);
    } else if (data.features) {
        // 格式3: GeoJSON格式
        points = extractCoordinatesFromGeoJSON(data);
    }
    
    return points;
}

// 解析文本文件(TXT/CSV)
function parseTextFile(content) {
    const lines = content.split('\n');
    const points = [];
    
    for (const line of lines) {
        if (!line.trim() || line.startsWith('#')) continue;
        
        // 支持多种分隔符: 逗号、空格、制表符
        const parts = line.split(/[, \t]+/).filter(part => part.trim() !== '');
        if (parts.length >= 2) {
            const lon = parseFloat(parts[0]);
            const lat = parseFloat(parts[1]);
            
            if (!isNaN(lon) && !isNaN(lat) && isValidLatLng(lat, lon)) {
                points.push([lon, lat]);
            }
        }
    }
    
    return points;
}

// 从GeoJSON中提取坐标
function extractCoordinatesFromGeoJSON(geojson) {
    const points = [];
    
    if (geojson.type === 'FeatureCollection') {
        geojson.features.forEach(feature => {
            if (feature.geometry && feature.geometry.type === 'LineString') {
                points.push(...feature.geometry.coordinates.filter(isValidCoordinate));
            }
        });
    } else if (geojson.type === 'Feature' && geojson.geometry.type === 'LineString') {
        points.push(...geojson.geometry.coordinates.filter(isValidCoordinate));
    } else if (geojson.type === 'LineString') {
        points.push(...geojson.coordinates.filter(isValidCoordinate));
    }
    
    return points;
}

// 验证坐标有效性
function isValidCoordinate(coord) {
    return Array.isArray(coord) && 
           coord.length >= 2 && 
           isValidLatLng(coord[1], coord[0]);
}

function isValidLatLng(lat, lng) {
    return !isNaN(lat) && !isNaN(lng) &&
           lat >= -90 && lat <= 90 && 
           lng >= -180 && lng <= 180;
}

// 绘制航线（共用函数）
function drawRoute(points) {
    if (points.length === 0) {
        alert('没有有效的航线数据');
        return;
    }
    
    // 清除现有航线
    if (amapPolyline) {
        centerMap.remove(amapPolyline);
    }
    
    // 调整经度（处理国际日期变更线问题）
    routePoints = adjustLongitudeForRoute(points);
    
    // 创建新航线
    amapPolyline = new AMap.Polyline({
        path: routePoints,
        strokeColor: "#1890FF",
        strokeWeight: 5,
        strokeOpacity: 0.8,
        strokeStyle: "solid",
        lineJoin: "round",
        lineCap: "round",
        map: centerMap
    });
    
    updateRouteTable();
    centerMap.setFitView(amapPolyline);
    
    // 更新左栏地图显示
    if (leftMap) {
        leftMap.setFitView(new AMap.Polyline({
            path: routePoints,
            map: leftMap
        }));
    }
    
    // 开始船舶沿航线移动
    startShipMovement();
}

// 增强的错误处理
function handleResponse(response) {
    if (!response.ok) {
        throw new Error(`HTTP错误! 状态: ${response.status}`);
    }
    return response.json();
}

function handleError(error) {
    console.error('加载航线数据出错:', error);
    showNotification(`加载航线数据失败: ${error.message}`, 'error');
}

// 修正经度，确保经度在 -180 到 180 之间
function adjustRouteLongitude(routePoints) {
    const adjustedPoints = [];
    for (let i = 0; i < routePoints.length; i++) {
        let point = routePoints[i];

        // 确保经度值在 -180 到 180 之间
        if (point[0] > 180) {
            point[0] -= 360; // 如果经度大于 180，减去 360
        } else if (point[0] < -180) {
            point[0] += 360; // 如果经度小于 -180，增加 360
        }

        adjustedPoints.push(point);
    }
    return adjustedPoints;
}

function startShipMovement() {
    // 清除之前的动画
    if (shipAnimation) {
        clearInterval(shipAnimation);
    }
    
    // 如果没有航线，则随机移动
    if (routePoints.length === 0) {
        randomShipMovement();
        return;
    }
    
    // 重置船舶位置到起点
    shipMarker.setPosition(routePoints[0]);
    shipPositionIndex = 0;
    
    // 开始沿航线移动
    moveToNextPoint();
}

function moveToNextPoint() {
    // 如果已经到达终点，回到起点
    if (shipPositionIndex >= routePoints.length - 1) {
        shipPositionIndex = 0;
        shipMarker.setPosition(routePoints[0]);
    }
    
    const startPoint = routePoints[shipPositionIndex];
    const endPoint = routePoints[shipPositionIndex + 1];
    
    // 调整经度
    const adjustedEndPoint = adjustLongitude(startPoint, endPoint);
    
    // 计算两点之间的距离
    const distance = Math.sqrt(
        Math.pow(adjustedEndPoint[0] - startPoint[0], 2) + 
        Math.pow(adjustedEndPoint[1] - startPoint[1], 2)
    );
    
    // 设置移动速度 (0.0002度/步)
    const speed = 0.002;
    const steps = Math.ceil(distance / speed);
    let currentStep = 0;
    
    // 计算每一步的移动增量
    const lngIncrement = (adjustedEndPoint[0] - startPoint[0]) / steps;
    const latIncrement = (adjustedEndPoint[1] - startPoint[1]) / steps;
    
    // 开始动画
    shipAnimation = setInterval(function() {
        if (currentStep >= steps) {
            // 到达当前航点，移动到下一个航点
            clearInterval(shipAnimation);
            shipPositionIndex++;
            moveToNextPoint();
            return;
        }
        
        // 计算新位置
        const newLng = startPoint[0] + lngIncrement * currentStep;
        const newLat = startPoint[1] + latIncrement * currentStep;
        
        // 更新船舶位置
        shipMarker.setPosition([newLng, newLat]);
        
        // 更新左栏地图中心点
        leftMap.setCenter([newLng, newLat]);
        
        currentStep++;
        
        // 每移动20步更新一次天气
        if (currentStep % 20 === 0) {
            updateLiveWeather(new AMap.Weather());
        }
    }, 0.01); // 每50毫秒移动一步
}

function adjustLongitude(startPoint, endPoint) {
    let adjustedEndPoint = [...endPoint]; // 创建副本，避免修改原始数据

    // 如果起始点经度与结束点经度相差超过 180度，则需要调整
    if (Math.abs(endPoint[0] - startPoint[0]) > 180) {
        if (endPoint[0] > startPoint[0]) {
            adjustedEndPoint[0] -= 360; // 减去360度
        } else {
            adjustedEndPoint[0] += 360; // 加上360度
        }
    }
    
    return adjustedEndPoint;
}

function randomShipMovement() {
    let direction = 0;
    shipAnimation = setInterval(function() {
        direction += 0.02;
        const pos = shipMarker.getPosition();
        const newPos = [
            pos.lng + Math.sin(direction) * 0.02,
            pos.lat + Math.cos(direction) * 0.01
        ];
        shipMarker.setPosition(newPos);
        leftMap.setCenter(newPos);
    }, 500);
}

// 清除航线并重置
function clearPolyline() {
    if (amapPolyline) {
        centerMap.remove(amapPolyline);
        amapPolyline = null;
    }
    routePoints = [];
    updateRouteTable();

    // 停止船舶动画
    if (shipAnimation) {
        clearInterval(shipAnimation);
    }

    // 重置船舶位置
    if (shipMarker) {
        shipMarker.setPosition([121.4925, 31.2416]);
        leftMap.setCenter([121.4925, 31.2416]);
    }
}

function updateRouteTable() {
    const tbody = document.getElementById('routeData');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (routePoints.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#999">暂无航线数据</td></tr>';
        return;
    }
    
    routePoints.forEach(function(point, index) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${point[0].toFixed(6)}</td>
            <td>${point[1].toFixed(6)}</td>
        `;
        tbody.appendChild(row);
    });
}

function resetMapView() {
    centerMap.setZoomAndCenter(10, [121.4737, 31.2304]);
}

function zoomIn() {
    centerMap.zoomIn();
}

function zoomOut() {
    centerMap.zoomOut();
}

// ==================== 航线滚动功能 ====================
function initRouteScroller() {
    const scrollBox = document.querySelector('.route_scroll_box');
    if (!scrollBox) return;
    
    const scrollItems = document.querySelectorAll('.route_scroll');
    
    if (scrollItems.length < 8) {
        scrollBox.innerHTML += scrollBox.innerHTML;
    }
    
    // 调整滚动速度为50秒完成一个循环
    scrollBox.style.animationDuration = '50s';
    
    const container = document.querySelector('.route_scroll_container');
    if (container) {
        container.addEventListener('mouseenter', () => {
            scrollBox.style.animationPlayState = 'paused';
        });
        container.addEventListener('mouseleave', () => {
            scrollBox.style.animationPlayState = 'running';
        });
    }
}

// 更新天气信息（如果有这个功能）
function updateLiveWeather(weather) {
    if (!weather) return;
}

// ==================== UI事件处理 ====================
function initUIEvents() {
    // 可以在这里添加其他UI事件处理
    const clearBtn = document.getElementById('clearRouteBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearPolyline);
    }
    
    const resetBtn = document.getElementById('resetViewBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetMapView);
    }
    
    const zoomInBtn = document.getElementById('zoomInBtn');
    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', zoomIn);
    }
    
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', zoomOut);
    }
    
    // 初始化滚动效果
    initRouteScroller();
}

// 在DOM加载完成后初始化UI事件
document.addEventListener('DOMContentLoaded', initUIEvents);

// 1. 定义海洋数据层变量
let currentLayer = null;
let windLayer = null;
let waveLayer = null;
let typhoonLayer = null;

// 2. 创建控制按钮
function createDataControlPanel() {
    // 创建控制面板容器
    const controlPanel = document.createElement('div');
    controlPanel.className = 'ocean-data-controls';
    controlPanel.style.position = 'absolute';
    controlPanel.style.top = '10px';
    controlPanel.style.right = '10px';
    controlPanel.style.zIndex = '100';
    controlPanel.style.backgroundColor = 'rgba(0, 32, 96, 0.8)';
    controlPanel.style.padding = '10px';
    controlPanel.style.borderRadius = '5px';
    controlPanel.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.3)';

    // 创建按钮
    const layers = [
        { id: 'toggle-currents', text: '洋流信息', handler: toggleOceanCurrents },
        { id: 'toggle-wind', text: '风向信息', handler: toggleWindDirection },
        { id: 'toggle-waves', text: '海浪信息', handler: toggleWaveHeight },
        { id: 'toggle-typhoon', text: '台风信息', handler: toggleTyphoonInfo }
    ];

    layers.forEach(layer => {
        const button = document.createElement('button');
        button.id = layer.id;
        button.textContent = layer.text;
        button.className = 'ocean-data-btn';
        button.style.margin = '5px';
        button.style.padding = '8px 12px';
        button.style.backgroundColor = '#0066cc';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '4px';
        button.style.cursor = 'pointer';
        button.onclick = layer.handler;
        button.onmouseover = function() { this.style.backgroundColor = '#0055aa'; };
        button.onmouseout = function() { this.style.backgroundColor = '#0066cc'; };
        controlPanel.appendChild(button);
    });

    // 将控制面板添加到中心地图
    document.querySelector('.center-map-container .dataAllBorder02').appendChild(controlPanel);
}

// 3. 洋流信息可视化 - 扩展到整个北太平洋
function toggleOceanCurrents() {
    if (currentLayer) {
        centerMap.remove(currentLayer);
        currentLayer = null;
        document.getElementById('toggle-currents').style.backgroundColor = '#0066cc';
        return;
    }

    // 创建北太平洋主要洋流数组
    const currents = [
        // 黑潮（日本洋流）- 从菲律宾向北到日本
        { 
            path: [
                [124, 20], [125, 22], [126, 24], [127, 26], 
                [128, 28], [129, 29], [130, 29.5], [132, 30], [138, 32]
            ],
            color: '#0066cc',
            width: 6,
            name: '黑潮'
        },
        // 北太平洋暖流 - 从日本向东到北美
        {
            path: [
                [140, 32], [145, 38], [155, 42], [165, 45], 
                [175, 48], [185, 48], [195, 47], [205, 45]
            ],
            color: '#0088ff',
            width: 5,
            name: '北太平洋暖流'
        },
        // 加利福尼亚寒流 - 从北美向南
        {
            path: [
                [230, 45], [228, 42], [226, 38], [224, 34], 
                [222, 30], [220, 26], [218, 22]
            ],
            color: '#00aaff',
            width: 5,
            name: '加利福尼亚寒流'
        },
        // 北赤道流 - 从中美洲向西
        {
            path: [
                [260, 15], [250, 16], [240, 17], [230, 18], 
                [220, 18], [210, 17], [200, 16], [190, 15], 
                [180, 15], [170, 15], [160, 14], [150, 13], 
                [140, 12], [130, 12]
            ],
            color: '#33bbff',
            width: 4,
            name: '北赤道流'
        },
        // 阿拉斯加环流
        {
            path: [
                [230, 48], [225, 48], [220, 50], [215, 52], [210, 55]
            ],
            color: '#0044cc',
            width: 4,
            name: '阿拉斯加环流'
        },
        // 黄海暖流
        {
            path: [
                [128, 30], [127, 31], [126, 32], [125, 33], [124, 34]
            ],
            color: '#0099ff',
            width: 3,
            name: '黄海暖流'
        },
        // 亲潮（千岛寒流）
        {
            path: [
                [155, 50], [150, 48], [145, 46], [142, 45.89], 
                [140, 45], [138, 44], [136, 40]
            ],
            color: '#66ccff',
            width: 4,
            name: '亲潮'
        },
        // 东海沿岸流
        {
            path: [
                [125, 26], [124, 27], [123, 28]
            ],
            color: '#33bbff',
            width: 3,
            name: '东海沿岸流'
        }
    ];

    currentLayer = new AMap.OverlayGroup();

    // 绘制洋流线及箭头
    currents.forEach(current => {
        // 预处理路径点，将经度转换为-180到180范围
        const normalizedPath = current.path.map(coord => {
            let lng = coord[0];
            // 将经度规范化为-180到180范围
            while (lng > 180) lng -= 360;
            while (lng < -180) lng += 360;
            return [lng, coord[1]];
        });
        
        // 检查这条洋流线是否跨越了日期线
        let crossesDateline = false;
        for (let i = 1; i < normalizedPath.length; i++) {
            // 如果相邻两点经度差绝对值超过180度，认为跨越了日期线
            if (Math.abs(normalizedPath[i][0] - normalizedPath[i-1][0]) > 180) {
                crossesDateline = true;
                break;
            }
        }
        
        if (crossesDateline) {
            // 对于跨越日期线的洋流，拆分为两段绘制
            let segments = [];
            let currentSegment = [];
            
            for (let i = 0; i < normalizedPath.length; i++) {
                let lng = normalizedPath[i][0];
                let lat = normalizedPath[i][1];
                
                if (currentSegment.length === 0) {
                    // 第一个点
                    currentSegment.push([lng, lat]);
                } else {
                    // 检查是否跨越日期线
                    const prevLng = currentSegment[currentSegment.length-1][0];
                    if (Math.abs(lng - prevLng) > 180) {
                        // 跨越日期线，结束当前段，开始新段
                        segments.push(currentSegment);
                        currentSegment = [[lng, lat]];
                    } else {
                        currentSegment.push([lng, lat]);
                    }
                }
            }
            
            // 添加最后一段
            if (currentSegment.length > 0) {
                segments.push(currentSegment);
            }
            
            // 绘制各段
            segments.forEach(segment => {
                if (segment.length > 1) {
                    const points = segment.map(coord => new AMap.LngLat(coord[0], coord[1]));
                    const polyline = new AMap.Polyline({
                        path: points,
                        strokeColor: current.color,
                        strokeWeight: current.width,
                        strokeOpacity: 0.8,
                        showDir: true,
                        dirColor: current.color
                    });
                    currentLayer.addOverlay(polyline);
                }
            });
            
            // 创建洋流名称标签 - 选择最长的一段放置标签
            let longestSegment = segments.reduce((longest, current) => 
                current.length > longest.length ? current : longest, []);
            
            if (longestSegment.length > 0) {
                const midIndex = Math.floor(longestSegment.length/2);
                const midPoint = new AMap.LngLat(
                    longestSegment[midIndex][0], 
                    longestSegment[midIndex][1]
                );
                
                const label = new AMap.Text({
                    text: current.name,
                    position: midPoint,
                    anchor: 'center',
                    style: {
                        'background-color': 'rgba(0,32,96,0.7)',
                        'border-radius': '3px',
                        'color': 'white',
                        'padding': '3px 5px',
                        'font-size': '12px'
                    }
                });
                currentLayer.addOverlay(label);
            }
        } else {
            // 未跨越日期线的洋流正常绘制
            const points = normalizedPath.map(coord => 
                new AMap.LngLat(coord[0], coord[1]));
            
            const polyline = new AMap.Polyline({
                path: points,
                strokeColor: current.color,
                strokeWeight: current.width,
                strokeOpacity: 0.8,
                showDir: true,
                dirColor: current.color
            });
            
            currentLayer.addOverlay(polyline);
            
            // 创建洋流名称标签
            const midPoint = points[Math.floor(points.length/2)];
            const label = new AMap.Text({
                text: current.name,
                position: midPoint,
                anchor: 'center',
                style: {
                    'background-color': 'rgba(0,32,96,0.7)',
                    'border-radius': '3px',
                    'color': 'white',
                    'padding': '3px 5px',
                    'font-size': '12px'
                }
            });
            
            currentLayer.addOverlay(label);
        }
    });
    
    centerMap.add(currentLayer);
    document.getElementById('toggle-currents').style.backgroundColor = '#009933';
}

// 4. 风向信息可视化 - 扩展到整个北太平洋
function toggleWindDirection() {
    if (windLayer) {
        centerMap.remove(windLayer);
        windLayer = null;
        document.getElementById('toggle-wind').style.backgroundColor = '#0066cc';
        return;
    }

    // 创建风向数据点 - 覆盖整个北太平洋
    const windData = [];
    // 生成整个北太平洋的网格点（从120E到120W，从10N到60N）
    for (let lng = 120; lng <= 240; lng += 6) {
        for (let lat = 10; lat <= 60; lat += 6) {
            
            let angle, speed;
            
            if (lat < 30) {
                // 贸易风区域 - 东北风
                angle = 45 + Math.sin(lng/10) * 20 + Math.cos(lat/5) * 15;
                speed = 5 + Math.sin(lng/15) * 2;
            } else if (lat < 50) {
                // 西风带 - 西南风
                angle = 225 + Math.sin(lng/12) * 25 + Math.cos(lat/8) * 20;
                speed = 8 + Math.sin(lng/10) * 3 + Math.cos(lat/6) * 2;
            } else {
                // 极地东风 - 东北风
                angle = 45 + Math.sin(lng/8) * 15 + Math.cos(lat/7) * 10;
                speed = 6 + Math.sin(lng/12) * 2;
            }
            
            // 季节性变化（根据太平洋实际风向模式）
            angle += Math.sin(lat/10) * 15; // 春季风向调整
            
            windData.push({
                position: [lng > 180 ? lng - 360 : lng, lat], // 调整经度跨越日期线
                angle: angle % 360,
                speed: speed
            });
        }
    }

    windLayer = new AMap.OverlayGroup();

    // 绘制风向箭头
    windData.forEach(point => {
        // 创建风向箭头标记
        const marker = new AMap.Marker({
            position: new AMap.LngLat(point.position[0], point.position[1]),
            content: createWindArrow(point.angle, point.speed),
            anchor: 'center'
        });
        
        windLayer.addOverlay(marker);
    });
    
    // 添加风带标签
    const windZones = [
        { position: [180, 20], name: "东北信风带" },
        { position: [180, 40], name: "中纬度西风带" },
        { position: [180, 55], name: "极地东风带" }
    ];
    
    windZones.forEach(zone => {
        const label = new AMap.Text({
            text: zone.name,
            position: new AMap.LngLat(zone.position[0], zone.position[1]),
            anchor: 'center',
            style: {
                'background-color': 'rgba(0,32,96,0.7)',
                'border-radius': '3px',
                'color': 'white',
                'padding': '5px 8px',
                'font-size': '14px',
                'font-weight': 'bold'
            }
        });
        windLayer.addOverlay(label);
    });
    
    centerMap.add(windLayer);
    document.getElementById('toggle-wind').style.backgroundColor = '#009933';
}

// 创建风向箭头DOM
function createWindArrow(angle, speed) {
    const div = document.createElement('div');
    div.style.width = '20px';
    div.style.height = '20px';
    
    // 箭头SVG
    const arrowColor = getWindSpeedColor(speed);
    const arrowSVG = `
    <svg width="20" height="20" viewBox="0 0 20 20">
        <polygon points="10,0 7,20 10,15 13,20" 
                 fill="${arrowColor}" 
                 transform="rotate(${angle}, 10, 10)" />
    </svg>`;
    
    div.innerHTML = arrowSVG;
    return div;
}

// 根据风速获取颜色
function getWindSpeedColor(speed) {
    if (speed < 4) return '#99ccff'; // 轻风
    if (speed < 7) return '#3399ff'; // 微风
    if (speed < 10) return '#0066cc'; // 中风
    if (speed < 15) return '#ff9900'; // 大风
    return '#ff3300'; // 强风/暴风
}

// 5. 海浪信息可视化 - 扩展到整个北太平洋
function toggleWaveHeight() {
    if (waveLayer) {
        centerMap.remove(waveLayer);
        waveLayer = null;
        document.getElementById('toggle-waves').style.backgroundColor = '#0066cc';
        return;
    }

    // 创建海浪高度数据网格 - 覆盖整个北太平洋
    const waveData = [];
    // 从120E到120W，从10N到60N
    for (let lng = 125; lng <= 240; lng += 8) {
        for (let lat = 10; lat <= 45; lat += 8) {
            // 调整经度跨越日期线
            const displayLng = lng > 180 ? lng - 360 : lng;
            
            // 检查该点是否在陆地上 - 使用地图API的isOnLand方法或自定义判断
            if (isPointOnLand(displayLng, lat)) {
                continue; // 跳过陆地上的点
            }
            
            // 模拟基于位置的海浪高度数据
            let height = calculateWaveHeight(lng, lat);
            
            waveData.push({
                position: [displayLng, lat],
                height: height
            });
        }
    }

    waveLayer = new AMap.OverlayGroup();

    // 绘制海浪高度标记
    waveData.forEach(point => {
        // 创建海浪高度标记
        const marker = new AMap.Marker({
            position: new AMap.LngLat(point.position[0], point.position[1]),
            content: createWaveIcon(point.height),
            anchor: 'center'
        });
        
        waveLayer.addOverlay(marker);
    });
    
    // 添加海浪区域标签
    const waveZones = [
        { position: [160, 20], name: "热带平静带", height: "0.5-1.5米" },
        { position: [170, 43], name: "西风带风暴区", height: "2.0-4.0米" },
        { position: [200, 30], name: "中太平洋浪区", height: "1.5-3.0米" },
        { position: [135, 35], name: "黑潮增强区", height: "2.0-3.5米" }
    ];
    
    waveZones.forEach(zone => {
        // 检查标签位置是否在海上
        if (!isPointOnLand(zone.position[0], zone.position[1])) {
            const label = new AMap.Text({
                text: `${zone.name}\n${zone.height}`,
                position: new AMap.LngLat(zone.position[0], zone.position[1]),
                anchor: 'center',
                style: {
                    'background-color': 'rgba(0,32,96,0.7)',
                    'border-radius': '3px',
                    'color': 'white',
                    'padding': '5px 8px',
                    'font-size': '12px',
                    'font-weight': 'bold',
                    'text-align': 'center',
                    'line-height': '1.2'
                }
            });
            waveLayer.addOverlay(label);
        }
    });
    
    centerMap.add(waveLayer);
    document.getElementById('toggle-waves').style.backgroundColor = '#009933';
}

// 判断点是否在陆地上
function isPointOnLand(lng, lat) {
    const landAreas = [
        // 亚洲东部海岸
        { minLng: 120, maxLng: 140, minLat: 25, maxLat: 45 },
        // 日本列岛
        { minLng: 130, maxLng: 145, minLat: 30, maxLat: 45 },
        // 北美西海岸
        { minLng: -130, maxLng: -115, minLat: 30, maxLat: 50 },
        // 夏威夷群岛
        { minLng: -160, maxLng: -154, minLat: 18, maxLat: 22 }
    ];
    
    return landAreas.some(area => 
        lng >= area.minLng && lng <= area.maxLng &&
        lat >= area.minLat && lat <= area.maxLat
    );
}

// 计算特定位置的海浪高度
function calculateWaveHeight(lng, lat) {
    let height;
    
    // 风力和纬度因素
    if (lat < 20) {
        // 低纬度热带区域，风浪较小
        height = 0.5 + Math.sin(lng/20) * 0.3;
    } else if (lat < 35) {
        // 副热带区域，适中的风浪
        height = 1.0 + Math.sin(lng/15) * 0.5 + Math.cos(lat/10) * 0.5;
    } else if (lat < 50) {
        // 中纬度西风带，风浪较大
        height = 2.0 + Math.sin(lng/10) * 0.8 + Math.cos(lat/8) * 0.7;
    } else {
        // 高纬度区域，适中到较大的风浪
        height = 1.5 + Math.sin(lng/12) * 0.6 + Math.cos(lat/9) * 0.6;
    }
    
    // 洋流因素 - 模拟主要洋流附近海浪增强
    // 黑潮和北太平洋暖流区域
    const kurishioEffect = Math.exp(-(Math.pow(lng-140, 2) + Math.pow(lat-35, 2))/300);
    const npCurrentEffect = Math.exp(-(Math.pow(lng-180, 2) + Math.pow(lat-45, 2))/500);
    
    height += kurishioEffect * 1.0 + npCurrentEffect * 0.8;
    
    // 季节性调整 - 春季北太平洋特点
    height *= (1.0 + Math.sin(lat/20) * 0.2); // 春季调整
    
    // 限制合理范围
    height = Math.max(0.1, Math.min(5.0, height));
    
    return height;
}

// 创建海浪图标DOM
function createWaveIcon(height) {
    const div = document.createElement('div');
    div.style.width = '24px';
    div.style.height = '24px';
    
    // 根据海浪高度设置图标大小和颜色
    const waveColor = getWaveHeightColor(height);
    const waveSize = Math.min(24, Math.max(10, height * 4));
    
    // 波浪SVG
    const waveSVG = `
    <svg width="24" height="24" viewBox="0 0 24 24">
        <path d="M2,12 Q6,8 12,12 T22,12" 
              stroke="${waveColor}" 
              stroke-width="${height * 0.8}" 
              fill="none" />
        <text x="12" y="20" text-anchor="middle" fill="white" font-size="8">${height.toFixed(1)}</text>
    </svg>`;
    
    div.innerHTML = waveSVG;
    return div;
}

// 根据海浪高度获取颜色
function getWaveHeightColor(height) {
    if (height < 1) return '#99ccff'; // 小浪
    if (height < 2) return '#3399ff'; // 中浪
    if (height < 3) return '#0066cc'; // 大浪
    if (height < 4) return '#ff9900'; // 巨浪
    return '#ff3300'; // 狂浪
}

// 6. 台风信息可视化 (保持原样，无需修改)
function toggleTyphoonInfo() {
    if (typhoonLayer) {
        centerMap.remove(typhoonLayer);
        typhoonLayer = null;
        document.getElementById('toggle-typhoon').style.backgroundColor = '#0066cc';
        return;
    }

    // 创建台风数据（路径和强度）
    const typhoons = [
        {
            name: '台风1',
            path: [
                {position: [127, 23], time: '04-15 00:00', pressure: 980, wind: 30},
                {position: [126, 24], time: '04-15 06:00', pressure: 975, wind: 33},
                {position: [125, 25], time: '04-15 12:00', pressure: 970, wind: 35},
                {position: [124, 26], time: '04-15 18:00', pressure: 965, wind: 38},
                {position: [123, 27], time: '04-16 00:00', pressure: 960, wind: 40},
                {position: [122, 28], time: '04-16 06:00', pressure: 965, wind: 38},
                {position: [121, 29], time: '04-16 12:00', pressure: 970, wind: 35},
                {position: [120, 30], time: '04-16 18:00', pressure: 975, wind: 30},
                {position: [119, 31], time: '04-17 00:00', pressure: 980, wind: 28}
            ],
            radius: {
                seven: 300, // 7级风圈半径（公里）
                ten: 100,   // 10级风圈半径
                twelve: 50  // 12级风圈半径
            }
        },
        {
            name: '台风2',
            path: [
                {position: [133, 21], time: '04-14 12:00', pressure: 985, wind: 28},
                {position: [132, 22], time: '04-14 18:00', pressure: 980, wind: 30},
                {position: [131, 23], time: '04-15 00:00', pressure: 975, wind: 33},
                {position: [130, 24], time: '04-15 06:00', pressure: 970, wind: 35},
                {position: [129, 25], time: '04-15 12:00', pressure: 965, wind: 38}
            ],
            radius: {
                seven: 250,
                ten: 80,
                twelve: 40
            }
        }
    ];

    typhoonLayer = new AMap.OverlayGroup();

    // 绘制台风路径和风圈
    typhoons.forEach(typhoon => {
        // 转换坐标为AMap.LngLat对象
        const points = typhoon.path.map(point => new AMap.LngLat(point.position[0], point.position[1]));
        
        // 创建台风路径线
        const polyline = new AMap.Polyline({
            path: points,
            strokeColor: '#ff3300',
            strokeWeight: 3,
            strokeOpacity: 0.8,
            strokeStyle: 'dashed',
            showDir: true
        });
        typhoonLayer.addOverlay(polyline);
        
        // 添加台风位置点和风圈
        typhoon.path.forEach((point, index) => {
            // 当前位置（最后一个点）绘制完整风圈
            if (index === typhoon.path.length - 1) {
                // 添加7级风圈
                const circle7 = new AMap.Circle({
                    center: new AMap.LngLat(point.position[0], point.position[1]),
                    radius: typhoon.radius.seven * 1000, // 转换为米
                    strokeColor: '#ffcc00',
                    strokeOpacity: 0.8,
                    strokeWeight: 1,
                    fillColor: '#ffcc00',
                    fillOpacity: 0.1
                });
                typhoonLayer.addOverlay(circle7);
                
                // 添加10级风圈
                const circle10 = new AMap.Circle({
                    center: new AMap.LngLat(point.position[0], point.position[1]),
                    radius: typhoon.radius.ten * 1000,
                    strokeColor: '#ff9900',
                    strokeOpacity: 0.8,
                    strokeWeight: 1,
                    fillColor: '#ff9900',
                    fillOpacity: 0.15
                });
                typhoonLayer.addOverlay(circle10);
                
                // 添加12级风圈
                const circle12 = new AMap.Circle({
                    center: new AMap.LngLat(point.position[0], point.position[1]),
                    radius: typhoon.radius.twelve * 1000,
                    strokeColor: '#ff3300',
                    strokeOpacity: 0.8,
                    strokeWeight: 1,
                    fillColor: '#ff3300',
                    fillOpacity: 0.2
                });
                typhoonLayer.addOverlay(circle12);
                
                // 添加台风名称和信息
                const infoWindow = new AMap.InfoWindow({
                    content: `
                        <div style="padding:10px;background:#001f54;color:white;border-radius:5px;">
                            <div style="font-weight:bold;margin-bottom:5px;">${typhoon.name}</div>
                            <div>中心气压: ${point.pressure}hPa</div>
                            <div>最大风速: ${point.wind}m/s</div>
                            <div>时间: ${point.time}</div>
                        </div>
                    `,
                    offset: new AMap.Pixel(0, -10)
                });
                
                // 创建台风中心点标记
                const marker = new AMap.Marker({
                    position: new AMap.LngLat(point.position[0], point.position[1]),
                    content: createTyphoonIcon(point.wind),
                    anchor: 'center'
                });
                
                marker.on('mouseover', function() {
                    infoWindow.open(centerMap, marker.getPosition());
                });
                
                marker.on('mouseout', function() {
                    infoWindow.close();
                });
                
                typhoonLayer.addOverlay(marker);
            } else {
                // 历史点位只添加小圆点
                const historyMarker = new AMap.Marker({
                    position: new AMap.LngLat(point.position[0], point.position[1]),
                    content: `<div style="width:8px;height:8px;background:#ff3300;border-radius:50%;"></div>`,
                    anchor: 'center'
                });
                typhoonLayer.addOverlay(historyMarker);
            }
        });
        
        // 添加台风名称标签
        const nameLabel = new AMap.Text({
            text: typhoon.name,
            position: points[points.length - 1],
            offset: new AMap.Pixel(20, -20),
            style: {
                'background-color': '#ff3300',
                'border-radius': '3px',
                'color': 'white',
                'padding': '3px 5px',
                'font-size': '12px',
                'font-weight': 'bold'
            }
        });
        typhoonLayer.addOverlay(nameLabel);
    });
    
    centerMap.add(typhoonLayer);
    document.getElementById('toggle-typhoon').style.backgroundColor = '#009933';
}

// 创建台风图标DOM
function createTyphoonIcon(windSpeed) {
    const div = document.createElement('div');
    div.style.width = '24px';
    div.style.height = '24px';
    
    // 根据风速决定图标颜色
    let color = '#ffcc00';
    if (windSpeed >= 33) color = '#ff9900';
    if (windSpeed >= 42) color = '#ff3300';
    
    // 台风图标SVG
    const typhoonSVG = `
    <svg width="24" height="24" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" fill="${color}" fill-opacity="0.7" />
        <path d="M12,2 Q17,7 12,12 T12,22 M2,12 Q7,7 12,12 T22,12" 
              stroke="white" stroke-width="1.5" fill="none" />
    </svg>`;
    
    div.innerHTML = typhoonSVG;
    return div;
}

// 7. 初始化函数
function initOceanDataLayers() {
    // 在页面加载完成后创建控制面板
    createDataControlPanel();
    
    // 添加说明信息到地图
    const legend = document.createElement('div');
    legend.className = 'ocean-data-legend';
    legend.style.position = 'absolute';
    legend.style.bottom = '10px';
    legend.style.right = '10px';
    legend.style.zIndex = '100';
    legend.style.backgroundColor = 'rgba(0, 32, 96, 0.8)';
    legend.style.padding = '10px';
    legend.style.borderRadius = '5px';
    legend.style.color = 'white';
    legend.style.fontSize = '12px';
    legend.style.maxWidth = '250px';
    legend.innerHTML = `
        <div style="font-weight:bold;margin-bottom:5px;">图例说明:</div>
        <div><span style="color:#0066cc;">■</span> 洋流 - 蓝色线条代表洋流方向</div>
        <div><span style="color:#ff9900;">⟿</span> 风向 - 箭头指向风向，颜色表示风速</div>
        <div><span style="color:#3399ff;">≈</span> 海浪 - 波浪图标大小和颜色表示浪高</div>
        <div><span style="color:#ff3300;">●</span> 台风 - 红色圆圈表示台风位置和风圈</div>
        <div style="margin-top:5px;font-size:10px;">北太平洋气象海洋数据可视化系统 - 2025年4月版</div>
    `;
    
    document.querySelector('.center-map-container .dataAllBorder02').appendChild(legend);
    
    // 添加北太平洋区域名称标签
    const pacificRegions = [
        { position: [200, 30], name: "北太平洋" },
        { position: [155, 45], name: "阿留申海域" },
        { position: [230, 50], name: "阿拉斯加湾" },
        { position: [235, 35], name: "加利福尼亚海域" },
        { position: [140, 35], name: "日本海域" },
        { position: [125, 25], name: "东海" },
        { position: [120, 20], name: "南海" },
        { position: [165, 15], name: "热带太平洋" }
    ];
    
    const regionsLayer = new AMap.OverlayGroup();
    
    pacificRegions.forEach(region => {
        const lngCoord = region.position[0] > 180 ? region.position[0] - 360 : region.position[0];
        const label = new AMap.Text({
            text: region.name,
            position: new AMap.LngLat(lngCoord, region.position[1]),
            anchor: 'center',
            style: {
                'background-color': 'transparent',
                'color': '#a0c8ff',
                'font-size': '14px',
                'font-weight': 'bold',
                'text-shadow': '1px 1px 2px rgba(0,0,0,0.8)'
            }
        });
        regionsLayer.addOverlay(label);
    });
    
    centerMap.add(regionsLayer);
}

// 8. 添加北太平洋区域边界
function addPacificBoundary() {
    // 北太平洋大致范围（从亚洲东部到北美西部）
    const pacificBoundary = [
        [100, 0],   // 亚洲东南部
        [100, 65],  // 亚洲北部
        [250, 65],  // 北美西北部
        [250, 0],   // 北美西南部
        [100, 0]    // 闭合
    ];
    
    const boundaryPoints = pacificBoundary.map(coord => {
        // 调整经度超过180度的坐标
        let lng = coord[0];
        if (lng > 180) lng = lng - 360;
        return new AMap.LngLat(lng, coord[1]);
    });
    
    const boundary = new AMap.Polyline({
        path: boundaryPoints,
        strokeColor: '#3399ff',
        strokeWeight: 2,
        strokeOpacity: 0.5,
        strokeStyle: 'dashed'
    });
    
    centerMap.add(boundary);
}

// 9. 添加海洋数据图层控制面板的扩展功能
function createExtendedControlPanel() {
    // 创建数据源选择器
    const dataSourceContainer = document.createElement('div');
    dataSourceContainer.style.position = 'absolute';
    dataSourceContainer.style.bottom = '10px';
    dataSourceContainer.style.left = '10px';
    dataSourceContainer.style.zIndex = '100';
    dataSourceContainer.style.backgroundColor = 'rgba(0, 32, 96, 0.8)';
    dataSourceContainer.style.padding = '10px';
    dataSourceContainer.style.borderRadius = '5px';
    dataSourceContainer.style.color = 'white';
    
    // 添加数据源标题
    const sourceTitle = document.createElement('div');
    sourceTitle.textContent = '数据源选择';
    sourceTitle.style.fontWeight = 'bold';
    sourceTitle.style.marginBottom = '5px';
    dataSourceContainer.appendChild(sourceTitle);
    
    // 添加数据源选择按钮
    const sources = [
        { id: 'source-live', text: '实时数据' },
        { id: 'source-forecast', text: '预测数据' },
        { id: 'source-historical', text: '历史数据' }
    ];
    
    sources.forEach(source => {
        const button = document.createElement('button');
        button.id = source.id;
        button.textContent = source.text;
        button.style.margin = '2px';
        button.style.padding = '5px 8px';
        button.style.backgroundColor = source.id === 'source-live' ? '#009933' : '#0066cc';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '3px';
        button.style.cursor = 'pointer';
        button.onclick = function() {
            // 切换数据源按钮颜色
            sources.forEach(s => {
                document.getElementById(s.id).style.backgroundColor = '#0066cc';
            });
            this.style.backgroundColor = '#009933';
            
            // 显示数据源切换通知
            showNotification(`已切换到${source.text}模式`);
        };
        dataSourceContainer.appendChild(button);
    });
    
    // 添加日期选择器（用于历史和预测数据）
    const dateSelector = document.createElement('div');
    dateSelector.style.marginTop = '5px';
    
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.style.padding = '4px';
    dateInput.style.borderRadius = '3px';
    dateInput.style.border = 'none';
    dateInput.style.backgroundColor = '#001a4d';
    dateInput.style.color = 'white';
    dateInput.value = '2025-04-16'; // 默认为今天
    
    dateSelector.appendChild(dateInput);
    dataSourceContainer.appendChild(dateSelector);
    
    // 添加时间选择器
    const timeSelector = document.createElement('div');
    timeSelector.style.marginTop = '5px';
    
    const timeInput = document.createElement('select');
    timeInput.style.padding = '4px';
    timeInput.style.borderRadius = '3px';
    timeInput.style.border = 'none';
    timeInput.style.backgroundColor = '#001a4d';
    timeInput.style.color = 'white';
    timeInput.style.width = '100%';
    
    const times = ['00:00', '06:00', '12:00', '18:00'];
    times.forEach(time => {
        const option = document.createElement('option');
        option.value = time;
        option.textContent = time;
        timeInput.appendChild(option);
    });
    
    timeSelector.appendChild(timeInput);
    dataSourceContainer.appendChild(timeSelector);
    
    // 添加刷新按钮
    const refreshButton = document.createElement('button');
    refreshButton.textContent = '刷新数据';
    refreshButton.style.marginTop = '5px';
    refreshButton.style.padding = '5px 8px';
    refreshButton.style.backgroundColor = '#ff9900';
    refreshButton.style.color = 'white';
    refreshButton.style.border = 'none';
    refreshButton.style.borderRadius = '3px';
    refreshButton.style.cursor = 'pointer';
    refreshButton.style.width = '100%';
    refreshButton.onclick = function() {
        showNotification('正在刷新数据，请稍等...');
        setTimeout(() => {
            showNotification('数据已刷新');
        }, 1500);
    };
    dataSourceContainer.appendChild(refreshButton);
    
    document.querySelector('.center-map-container .dataAllBorder02').appendChild(dataSourceContainer);
}

// 10. 添加数据层相关的提示信息功能
function showNotification(message) {
    // 移除已有通知
    const existingNotification = document.querySelector('.ocean-data-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // 创建新通知
    const notification = document.createElement('div');
    notification.className = 'ocean-data-notification';
    notification.style.position = 'absolute';
    notification.style.top = '60px';
    notification.style.left = '50%';
    notification.style.transform = 'translateX(-50%)';
    notification.style.backgroundColor = 'rgba(0, 32, 96, 0.9)';
    notification.style.color = 'white';
    notification.style.padding = '10px 15px';
    notification.style.borderRadius = '5px';
    notification.style.zIndex = '200';
    notification.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
    notification.style.transition = 'opacity 0.5s';
    notification.textContent = message;
    
    document.querySelector('.center-map-container .dataAllBorder02').appendChild(notification);
    
    // 淡出效果
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            notification.remove();
        }, 500);
    }, 3000);
}

// 11. 添加数据层参数控制面板
function createDataParametersPanel() {
    const paramsPanel = document.createElement('div');
    paramsPanel.style.position = 'absolute';
    paramsPanel.style.top = '10px';
    paramsPanel.style.left = '10px';
    paramsPanel.style.zIndex = '100';
    paramsPanel.style.backgroundColor = 'rgba(0, 32, 96, 0.8)';
    paramsPanel.style.padding = '10px';
    paramsPanel.style.borderRadius = '5px';
    paramsPanel.style.color = 'white';
    paramsPanel.style.maxWidth = '200px';
    
    // 添加标题
    const paramTitle = document.createElement('div');
    paramTitle.textContent = '数据参数设置';
    paramTitle.style.fontWeight = 'bold';
    paramTitle.style.marginBottom = '5px';
    paramsPanel.appendChild(paramTitle);
    
    // 添加密度控制
    const densityControl = document.createElement('div');
    densityControl.style.marginBottom = '10px';
    
    const densityLabel = document.createElement('div');
    densityLabel.textContent = '数据密度:';
    densityLabel.style.marginBottom = '5px';
    densityControl.appendChild(densityLabel);
    
    const densitySlider = document.createElement('input');
    densitySlider.type = 'range';
    densitySlider.min = '1';
    densitySlider.max = '5';
    densitySlider.value = '3';
    densitySlider.style.width = '100%';
    densitySlider.style.backgroundColor = '#001a4d';
    densitySlider.onchange = function() {
        showNotification(`数据密度已设置为 ${this.value}`);
    };
    
    densityControl.appendChild(densitySlider);
    paramsPanel.appendChild(densityControl);
    
    // 添加颜色方案选择
    const colorSchemeControl = document.createElement('div');
    colorSchemeControl.style.marginBottom = '10px';
    
    const colorLabel = document.createElement('div');
    colorLabel.textContent = '颜色方案:';
    colorLabel.style.marginBottom = '5px';
    colorSchemeControl.appendChild(colorLabel);
    
    const colorSelect = document.createElement('select');
    colorSelect.style.width = '100%';
    colorSelect.style.padding = '4px';
    colorSelect.style.backgroundColor = '#001a4d';
    colorSelect.style.color = 'white';
    colorSelect.style.border = 'none';
    colorSelect.style.borderRadius = '3px';
    
    const colorSchemes = [
        { value: 'standard', text: '标准蓝色系' },
        { value: 'contrast', text: '高对比度' },
        { value: 'spectral', text: '光谱色' },
        { value: 'thermal', text: '热力图' }
    ];
    
    colorSchemes.forEach(scheme => {
        const option = document.createElement('option');
        option.value = scheme.value;
        option.textContent = scheme.text;
        colorSelect.appendChild(option);
    });
    
    colorSelect.onchange = function() {
        showNotification(`颜色方案已切换为 ${this.options[this.selectedIndex].text}`);
    };
    
    colorSchemeControl.appendChild(colorSelect);
    paramsPanel.appendChild(colorSchemeControl);
    
    // 添加显示设置
    const displaySettings = document.createElement('div');
    
    const settingsTitle = document.createElement('div');
    settingsTitle.textContent = '显示设置:';
    settingsTitle.style.marginBottom = '5px';
    displaySettings.appendChild(settingsTitle);
    
    // 添加复选框选项
    const options = [
        { id: 'show-labels', text: '显示标签' },
        { id: 'show-values', text: '显示数值' },
        { id: 'show-animation', text: '动画效果' }
    ];
    
    options.forEach(option => {
        const checkboxContainer = document.createElement('div');
        checkboxContainer.style.marginBottom = '5px';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = option.id;
        checkbox.checked = true;
        checkbox.style.marginRight = '5px';
        checkbox.onchange = function() {
            showNotification(`${option.text}已${this.checked ? '启用' : '禁用'}`);
        };
        
        const label = document.createElement('label');
        label.htmlFor = option.id;
        label.textContent = option.text;
        
        checkboxContainer.appendChild(checkbox);
        checkboxContainer.appendChild(label);
        displaySettings.appendChild(checkboxContainer);
    });
    
    paramsPanel.appendChild(displaySettings);
    
    // 添加应用按钮
    const applyButton = document.createElement('button');
    applyButton.textContent = '应用设置';
    applyButton.style.marginTop = '10px';
    applyButton.style.padding = '5px 8px';
    applyButton.style.backgroundColor = '#0066cc';
    applyButton.style.color = 'white';
    applyButton.style.border = 'none';
    applyButton.style.borderRadius = '3px';
    applyButton.style.cursor = 'pointer';
    applyButton.style.width = '100%';
    applyButton.onclick = function() {
        showNotification('设置已应用');
    };
    paramsPanel.appendChild(applyButton);
    
    document.querySelector('.center-map-container .dataAllBorder02').appendChild(paramsPanel);
}

// 12. 在地图加载完成后初始化所有功能
window.addEventListener('load', function() {
    // 确保地图已经初始化
    if (typeof centerMap !== 'undefined') {
        // 初始化基础海洋数据层
        initOceanDataLayers();
        
        // 添加北太平洋区域边界
        addPacificBoundary();
        
        // 显示欢迎信息
        setTimeout(() => {
            showNotification('北太平洋海洋数据可视化系统已加载');
        }, 1000);
    } else {
        // 如果地图尚未初始化，等待一段时间再尝试
        setTimeout(() => {
            if (typeof centerMap !== 'undefined') {
                initOceanDataLayers();
                addPacificBoundary();
                setTimeout(() => {
                    showNotification('北太平洋海洋数据可视化系统已加载');
                }, 1000);
            } else {
                console.error('地图未能成功加载，请刷新页面重试');
            }
        }, 2000);
    }
});
