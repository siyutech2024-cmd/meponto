from pathlib import Path
from textwrap import wrap

from PIL import Image
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "MePonto视觉整体方案.pdf"
IMG_DIR = ROOT / "images"

ORANGE = colors.HexColor("#FF7A00")
BLACK = colors.HexColor("#050505")
DARK = colors.HexColor("#222222")
GRAY = colors.HexColor("#666666")
LIGHT = colors.HexColor("#F5F5F5")
GREEN = colors.HexColor("#20A65A")

FONT_REG = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"
FONT_BOLD = "/System/Library/Fonts/STHeiti Medium.ttc"
pdfmetrics.registerFont(TTFont("MePontoRegular", FONT_REG))
pdfmetrics.registerFont(TTFont("MePontoBold", FONT_BOLD))


def text(c, value, x, y, size=11, color=DARK, font="MePontoRegular"):
    c.setFont(font, size)
    c.setFillColor(color)
    c.drawString(x, y, value)


def para(c, value, x, y, width_chars=52, size=10.5, leading=16, color=DARK):
    for line in value.split("\n"):
        lines = wrap(line, width_chars) if line else [""]
        for item in lines:
            text(c, item, x, y, size=size, color=color)
            y -= leading
    return y


def title_bar(c, title, subtitle=None):
    w, h = landscape(A4)
    c.setFillColor(ORANGE)
    c.rect(0, h - 22 * mm, w, 22 * mm, fill=1, stroke=0)
    text(c, title, 18 * mm, h - 14 * mm, 20, colors.white, "MePontoBold")
    if subtitle:
        text(c, subtitle, 18 * mm, h - 20 * mm, 8.5, colors.white)


def footer(c, page):
    w, _ = landscape(A4)
    text(c, "MePonto / PontoSys 品牌视觉方案", 18 * mm, 10 * mm, 8, GRAY)
    text(c, f"{page}", w - 22 * mm, 10 * mm, 8, GRAY)


def bullet(c, value, x, y, width_chars=48):
    c.setFillColor(ORANGE)
    c.circle(x - 4 * mm, y + 1.5, 1.4 * mm, fill=1, stroke=0)
    return para(c, value, x, y, width_chars=width_chars, size=10.2, leading=15)


def add_image(c, path, x, y, max_w, max_h):
    img = Image.open(path)
    iw, ih = img.size
    scale = min(max_w / iw, max_h / ih)
    dw, dh = iw * scale, ih * scale
    c.drawImage(str(path), x + (max_w - dw) / 2, y + (max_h - dh) / 2, dw, dh, preserveAspectRatio=True, mask="auto")


def cover(c):
    w, h = landscape(A4)
    c.setFillColor(ORANGE)
    c.rect(0, 0, w, h, fill=1, stroke=0)
    c.setFillColor(BLACK)
    c.rect(0, 0, w, 36 * mm, fill=1, stroke=0)
    text(c, "MePonto", 22 * mm, h - 44 * mm, 44, BLACK, "MePontoBold")
    text(c, "视觉整体方案", 22 * mm, h - 62 * mm, 28, BLACK, "MePontoBold")
    text(c, "城市配送服务品牌 / 站点运营 / 骑手与加盟体系", 22 * mm, h - 76 * mm, 13, BLACK)
    text(c, "CONECTAR • APOIAR • ENTREGAR", 22 * mm, h - 90 * mm, 13, BLACK, "MePontoBold")
    text(c, "最终方向：橙黑白、接地气、实用耐看、适合复制落地", 22 * mm, 21 * mm, 15, colors.white, "MePontoBold")
    text(c, "2026-05-27", 22 * mm, 12 * mm, 9, colors.white)
    c.showPage()


def decision_page(c):
    title_bar(c, "01 / 最终决策", "不追求过度高级，优先服务真实业务、人群和运营效率")
    x1, x2 = 20 * mm, 156 * mm
    y = 166 * mm
    text(c, "最终主方案", x1, y, 18, BLACK, "MePontoBold")
    y -= 14 * mm
    for item in [
        "保留原本 logo 样式：M 图形、速度线、倾斜字形、3D 阴影和整体排版不做大改。",
        "品牌名统一写作 MePonto，M 和 P 大写，其余小写。",
        "主色采用滴滴感橙色 #FF7A00，主图形和 Me 使用黑色，Ponto 使用白色。",
        "标语保留 CONECTAR • APOIAR • ENTREGAR，适合巴西市场的直接表达。",
        "整体气质：快、稳、亲近、可信、能落地。",
    ]:
        y = bullet(c, item, x1 + 6 * mm, y)
        y -= 2 * mm

    y2 = 166 * mm
    text(c, "为什么这样定", x2, y2, 18, BLACK, "MePontoBold")
    y2 -= 14 * mm
    for item in [
        "骑手端需要远距离可识别，橙黑白比复杂渐变更实用。",
        "加盟和站点场景需要稳定、可信、便于低成本复制。",
        "后台系统需要克制，橙色只做重点动作和品牌识别。",
        "真实业务人群更在意清楚、可靠、有支持感，而不是奢华感。",
    ]:
        y2 = bullet(c, item, x2 + 6 * mm, y2)
        y2 -= 2 * mm
    footer(c, 1)
    c.showPage()


def image_page(c, page, title, subtitle, image_name, notes):
    title_bar(c, title, subtitle)
    w, h = landscape(A4)
    add_image(c, IMG_DIR / image_name, 14 * mm, 30 * mm, 170 * mm, 126 * mm)
    c.setFillColor(LIGHT)
    c.roundRect(192 * mm, 34 * mm, 88 * mm, 116 * mm, 4 * mm, fill=1, stroke=0)
    text(c, "设计重点", 200 * mm, 139 * mm, 15, BLACK, "MePontoBold")
    y = 127 * mm
    for item in notes:
        y = bullet(c, item, 202 * mm, y, width_chars=25)
        y -= 2 * mm
    footer(c, page)
    c.showPage()


def store_page(c):
    image_page(
        c,
        5,
        "05 / 门店与站点装修方案",
        "低成本、耐用、可复制，服务骑手与日常运营",
        "04-store-design.png",
        [
            "门头要醒目但不浮夸：橙底、黑白 logo、清楚导视。",
            "内部要有接待、骑手签到、等候、取货架、装备架、充电区。",
            "Leader 办公桌、培训公告墙、QR 服务墙要服务管理动作。",
            "材料建议：可擦洗墙面、金属货架、防滑耐磨地面、简单 LED。",
            "空间优先保证动线：进店签到、取货、装备、离店不要互相堵住。",
        ],
    )


def execution_page(c):
    title_bar(c, "06 / 落地执行清单", "从设计图转为真实门店、物料和产品界面")
    x = 20 * mm
    y = 164 * mm
    sections = [
        ("品牌资产", ["确认主 logo 矢量版 SVG / PDF / PNG。", "输出横版、竖版、App icon、黑白版、透明底。", "整理三语言品牌名和标语使用规范。"]),
        ("线下物料", ["骑手马甲、配送包、车贴、工牌、门头、海报。", "优先使用橙黑白，减少复杂渐变和难印刷效果。", "所有物料保留二维码和联系方式位置。"]),
        ("门店配置", ["接待台、签到台、货架、装备架、充电站、饮水点。", "公告墙用于培训、规则、奖励、通知和安全提醒。", "后仓保持可锁、可盘点、可分区。"]),
        ("数字产品", ["骑手 App 大按钮、大数字、状态清楚。", "Leader / Franchise 后台白底为主，橙色做重点动作。", "PontoSys 继续使用统一登录、统一权限和模块化生态规则。"]),
    ]
    for idx, (heading, items) in enumerate(sections):
        col = idx % 2
        row = idx // 2
        bx = x + col * 135 * mm
        by = y - row * 68 * mm
        c.setFillColor(LIGHT)
        c.roundRect(bx, by - 52 * mm, 122 * mm, 56 * mm, 4 * mm, fill=1, stroke=0)
        text(c, heading, bx + 8 * mm, by - 9 * mm, 15, BLACK, "MePontoBold")
        yy = by - 21 * mm
        for item in items:
            yy = bullet(c, item, bx + 12 * mm, yy, width_chars=33)
    footer(c, 6)
    c.showPage()


def store_layout_page(c):
    title_bar(c, "07 / 门店功能分区建议", "按 30-60 平方米社区站点设计，优先保证日常运营动线")
    x = 18 * mm
    y = 164 * mm
    c.setFillColor(LIGHT)
    c.roundRect(x, 28 * mm, 126 * mm, 130 * mm, 4 * mm, fill=1, stroke=0)
    text(c, "推荐动线", x + 8 * mm, y - 8 * mm, 16, BLACK, "MePontoBold")
    route = [
        "1. 骑手进门：扫码 / 签到 / 查看公告",
        "2. 到接待台：咨询、异常、资料提交",
        "3. 到货架区：取货、核对、打包",
        "4. 到装备区：取配送包、雨衣、头盔",
        "5. 到充电区：手机、充电宝、临时补电",
        "6. 离店出发：门口导视和安全提醒",
    ]
    yy = y - 22 * mm
    for item in route:
        yy = bullet(c, item, x + 13 * mm, yy, width_chars=34)
        yy -= 3 * mm

    text(c, "面积配置参考", 160 * mm, y - 8 * mm, 16, BLACK, "MePontoBold")
    rows = [
        ("门头/入口", "醒目识别、营业信息、二维码", "外立面"),
        ("接待/签到", "咨询、注册、异常处理", "4-6㎡"),
        ("等候区", "短暂停留、培训集合", "6-10㎡"),
        ("取货/暂存", "订单架、分区标签、核对台", "8-14㎡"),
        ("装备/充电", "包、雨衣、头盔、手机补电", "5-8㎡"),
        ("Leader 办公", "排班、沟通、数据检查", "4-6㎡"),
        ("后仓", "耗材、备用装备、清洁用品", "4-8㎡"),
    ]
    table_x, table_y = 160 * mm, y - 20 * mm
    col_w = [28 * mm, 63 * mm, 24 * mm]
    row_h = 10 * mm
    c.setFillColor(BLACK)
    c.rect(table_x, table_y, sum(col_w), row_h, fill=1, stroke=0)
    headers = ["区域", "功能", "面积"]
    tx = table_x
    for i, htxt in enumerate(headers):
        text(c, htxt, tx + 3 * mm, table_y + 3 * mm, 8.5, colors.white, "MePontoBold")
        tx += col_w[i]
    yy = table_y - row_h
    for i, row in enumerate(rows):
        c.setFillColor(colors.white if i % 2 == 0 else colors.HexColor("#FFF3E8"))
        c.rect(table_x, yy, sum(col_w), row_h, fill=1, stroke=0)
        tx = table_x
        for j, cell in enumerate(row):
            text(c, cell, tx + 3 * mm, yy + 3 * mm, 8.2, DARK)
            tx += col_w[j]
        yy -= row_h

    text(c, "核心原则：前场服务骑手，中场处理订单，后场管理物资；不要为了展示牺牲取货效率。", 160 * mm, 34 * mm, 9.5, BLACK, "MePontoBold")
    footer(c, 7)
    c.showPage()


def materials_page(c):
    title_bar(c, "08 / 低成本装修与物料清单", "先满足运营，再逐步升级形象")
    x = 18 * mm
    y = 164 * mm
    blocks = [
        ("基础装修", ["橙色主墙 1 面，其余白/浅灰墙面。", "耐磨防滑地胶或地砖，方便清洁。", "普通 LED 灯，重点照亮接待台和货架。", "黑白导视牌，少做复杂造型。"]),
        ("运营家具", ["接待桌 1 张，Leader 工作桌 1 张。", "金属货架 2-4 组，按订单状态分区。", "等候长凳 2-3 条，耐脏耐用。", "储物柜或可锁后仓，存装备和耗材。"]),
        ("骑手服务", ["手机充电排插和充电宝架。", "饮水机或桶装水位置。", "雨衣、头盔、配送包挂架。", "安全提醒、培训流程、奖励规则公告墙。"]),
        ("品牌物料", ["门头招牌、玻璃贴、营业时间牌。", "二维码服务墙：注册、客服、培训、社群。", "招聘海报、加盟咨询海报、规则海报。", "骑手马甲、配送包贴、工牌。"]),
    ]
    for idx, (heading, items) in enumerate(blocks):
        col = idx % 2
        row = idx // 2
        bx = x + col * 135 * mm
        by = y - row * 68 * mm
        c.setFillColor(LIGHT)
        c.roundRect(bx, by - 53 * mm, 124 * mm, 57 * mm, 4 * mm, fill=1, stroke=0)
        text(c, heading, bx + 8 * mm, by - 9 * mm, 15, BLACK, "MePontoBold")
        yy = by - 21 * mm
        for item in items:
            yy = bullet(c, item, bx + 12 * mm, yy, width_chars=34)
    text(c, "建议采购策略：先用标准货架、标准桌椅、标准灯具完成开业；品牌感主要靠门头、主墙、导视和物料统一。", 20 * mm, 24 * mm, 10, BLACK, "MePontoBold")
    footer(c, 8)
    c.showPage()


def rollout_page(c):
    title_bar(c, "09 / 推进节奏", "从概念图到第一家样板站，再复制到加盟网络")
    x = 22 * mm
    y = 156 * mm
    steps = [
        ("第 1 阶段：定稿", "确定 logo、主色、门店功能区、基础物料清单。输出 SVG/PNG/PDF 品牌包。"),
        ("第 2 阶段：样板站", "选择一个真实站点做低成本样板，验证动线、货架容量、骑手停留和服务效率。"),
        ("第 3 阶段：运营测试", "连续 2-4 周记录问题：拥堵点、物料缺口、公告是否清楚、Leader 办公是否够用。"),
        ("第 4 阶段：标准化", "形成门店施工包、采购包、海报包、导视包和加盟开店手册。"),
        ("第 5 阶段：复制", "按城市/区域复制，允许小面积站点做轻量版，大站点做完整服务中心版。"),
    ]
    for i, (heading, body) in enumerate(steps):
        yy = y - i * 26 * mm
        c.setFillColor(ORANGE if i == 0 else BLACK)
        c.circle(x, yy + 2 * mm, 5 * mm, fill=1, stroke=0)
        text(c, str(i + 1), x - 2 * mm, yy, 9, colors.white, "MePontoBold")
        c.setStrokeColor(ORANGE)
        if i < len(steps) - 1:
            c.line(x, yy - 4 * mm, x, yy - 20 * mm)
        text(c, heading, x + 13 * mm, yy + 4 * mm, 14, BLACK, "MePontoBold")
        para(c, body, x + 13 * mm, yy - 5 * mm, width_chars=86, size=10.5, leading=15)
    c.setFillColor(colors.HexColor("#FFF3E8"))
    c.roundRect(178 * mm, 32 * mm, 92 * mm, 42 * mm, 4 * mm, fill=1, stroke=0)
    text(c, "决策建议", 186 * mm, 61 * mm, 15, BLACK, "MePontoBold")
    para(c, "不要一开始追求豪华装修。先做一家能跑通注册、培训、取货、管理、支持的标准站，再根据真实运营数据升级。", 186 * mm, 51 * mm, width_chars=28, size=10.2, leading=15)
    footer(c, 9)
    c.showPage()


def main():
    c = canvas.Canvas(str(OUT), pagesize=landscape(A4))
    cover(c)
    decision_page(c)
    image_page(
        c,
        2,
        "02 / 品牌视觉总览",
        "颜色、logo、App icon、基础 UI 与装备物料方向",
        "01-brand-board.png",
        [
            "主色橙 #FF7A00，建立配送和城市服务识别。",
            "黑白辅助保证远距离和小尺寸可读。",
            "视觉语言朴素直接，适合骑手、加盟商和运营团队。",
            "App icon、配送包、马甲、门头应使用统一色彩比例。",
        ],
    )
    image_page(
        c,
        3,
        "03 / 业务应用场景",
        "骑手、站点、加盟资料和团队沟通物料",
        "02-business-applications.png",
        [
            "优先使用真实业务照片和城市配送场景。",
            "骑手装备要醒目、耐脏、易印刷。",
            "加盟资料强调支持体系、流程和收益模型。",
            "工牌和海报要让角色、联系方式、二维码一眼可见。",
        ],
    )
    image_page(
        c,
        4,
        "04 / App 与后台系统方向",
        "PontoSys 生态内的 rider、leader、franchise 工作界面",
        "03-product-ui.png",
        [
            "骑手端：大按钮、大状态、大金额，减少复杂路径。",
            "Leader 端：订单、骑手在线、站点表现、异常提醒。",
            "Franchise 端：收入、结算、培训、支持任务。",
            "系统界面少用大面积橙色，橙色只用于重点动作。",
        ],
    )
    store_page(c)
    execution_page(c)
    store_layout_page(c)
    materials_page(c)
    rollout_page(c)
    c.save()
    print(OUT)


if __name__ == "__main__":
    main()
