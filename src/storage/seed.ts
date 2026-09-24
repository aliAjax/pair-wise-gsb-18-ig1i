// 首启示例数据：让纸表上"日期对不上"的几类情况在看板上一目了然
// 演示基准日固定为 2026-09-24（与当前日期一致），影像有效期 30 天。

import { BoardData } from "../domain/types";

const T0 = "2026-09-24T08:30:00.000Z";
const T1 = "2026-09-24T09:00:00.000Z";

export const SEED_DATA: BoardData = {
  cases: [
    {
      // 资料齐备且时段无冲突：已排
      id: "C-1001",
      patientName: "张敏",
      toothNo: "46",
      imagingDate: "2026-09-10",
      anesthesia: "已确认",
      slot: { date: "2026-09-28", period: "上午", microscope: "M1" },
      status: "已排",
      postOp: null,
      followUp: null,
      lastHoldReasons: [],
      createdAt: T0,
      updatedAt: T0,
    },
    {
      // 影像过期（8-01 拍，超过 30 天）+ 麻醉未评估：留在待排
      id: "C-1002",
      patientName: "李伟",
      toothNo: "21",
      imagingDate: "2026-08-01",
      anesthesia: "未评估",
      slot: null,
      status: "待排",
      postOp: null,
      followUp: null,
      lastHoldReasons: ["IMAGING_EXPIRED", "ANESTHESIA_UNCONFIRMED"],
      createdAt: T0,
      updatedAt: T0,
    },
    {
      // 麻醉禁忌：即使影像新鲜也不能排
      id: "C-1003",
      patientName: "王芳",
      toothNo: "16",
      imagingDate: "2026-09-20",
      anesthesia: "禁忌",
      slot: null,
      status: "待排",
      postOp: null,
      followUp: null,
      lastHoldReasons: ["ANESTHESIA_CONTRAINDICATED"],
      createdAt: T0,
      updatedAt: T0,
    },
    {
      // 已手术待复查：手术日 9-08，9-22 即满两周，今天已到期
      id: "C-1004",
      patientName: "赵磊",
      toothNo: "36",
      imagingDate: "2026-09-01",
      anesthesia: "已确认",
      slot: { date: "2026-09-08", period: "下午", microscope: "M2" },
      status: "待复查",
      postOp: {
        surgeryDate: "2026-09-08",
        resectionLengthMm: 3,
        retrofillMaterial: "MTA",
        specimenNo: "SP-2026-0301",
      },
      followUp: null,
      lastHoldReasons: [],
      createdAt: T0,
      updatedAt: T1,
    },
    {
      // 已手术，复查日还没到（9-30 才满两周）
      id: "C-1005",
      patientName: "陈静",
      toothNo: "11",
      imagingDate: "2026-09-12",
      anesthesia: "已确认",
      slot: { date: "2026-09-16", period: "上午", microscope: "M1" },
      status: "待复查",
      postOp: {
        surgeryDate: "2026-09-16",
        resectionLengthMm: 2.5,
        retrofillMaterial: "iRoot BP Plus",
        specimenNo: "SP-2026-0307",
      },
      followUp: null,
      lastHoldReasons: [],
      createdAt: T0,
      updatedAt: T1,
    },
    {
      // 上一台占着 M1 9-28 上午：新病例同镜同时段会被冲突拦截
      id: "C-1006",
      patientName: "刘洋",
      toothNo: "47",
      imagingDate: "2026-09-18",
      anesthesia: "已确认",
      slot: null,
      status: "待排",
      postOp: null,
      followUp: null,
      lastHoldReasons: [],
      createdAt: T1,
      updatedAt: T1,
    },
    {
      // 已在复诊名单：两周复查时骨缺损增大
      id: "C-1007",
      patientName: "孙倩",
      toothNo: "26",
      imagingDate: "2026-08-20",
      anesthesia: "已确认",
      slot: { date: "2026-09-02", period: "下午", microscope: "M1" },
      status: "复诊",
      postOp: {
        surgeryDate: "2026-09-02",
        resectionLengthMm: 3,
        retrofillMaterial: "MTA",
        specimenNo: "SP-2026-0288",
      },
      followUp: {
        reviewDate: "2026-09-16",
        painRelieved: true,
        boneDefectTrend: "增大",
        note: "远中骨密度减低，安排复诊评估再处理",
      },
      lastHoldReasons: [],
      createdAt: T0,
      updatedAt: T1,
    },
  ],
};
