"""Public API contracts. Human-confirmed schedules are separate from OCR."""
from datetime import date
from typing import Literal, Self
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Profile(Model):
    name: str = Field(default="", max_length=40)
    age: str = Field(default="", max_length=3)
    health: str = Field(default="", max_length=500)
    allergy: str = Field(default="", max_length=500)
    diet: str = Field(default="", max_length=500)

    @field_validator("age")
    @classmethod
    def age_range(cls, value):
        if value and (not value.isdigit() or not 1 <= int(value) <= 120):
            raise ValueError("年龄应为 1 至 120")
        return value


class Credentials(Model):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)
    username: str = Field(min_length=3, max_length=40, pattern=r"^[\w@.+-]+$")
    password: str = Field(min_length=8, max_length=128)


class Message(Model):
    text: str = Field(min_length=1, max_length=2000)
    request_id: str = Field(min_length=8, max_length=80, pattern=r"^[\w-]+$")
    scene: Literal["chat", "card", "drug", "report", "alarm"] = "chat"


class Photo(Model):
    data_url: str = Field(max_length=12_000_000)
    kind: Literal["medicine", "report"] = "medicine"


class PDFUpload(Photo):
    filename: str = Field(min_length=1, max_length=180)


class PDFSelection(Model):
    pages: list[int] = Field(min_length=1, max_length=5)

    @field_validator("pages", mode="before")
    @classmethod
    def pages_valid(cls, value):
        if not isinstance(value, list) or any(type(p) is not int or p < 1 for p in value) or len(set(value)) != len(value):
            raise ValueError("请选择不重复的页码")
        return sorted(value)


class DraftCreate(Model):
    demo: bool = False


class MedicationDose(Model):
    dose: str = Field(max_length=40)
    time: str = Field(max_length=5)
    meal: str = Field(default="", max_length=80)


class Medication(Model):
    id: str = Field(max_length=64)
    name: str = Field(default="", max_length=80)
    dose: str = Field(default="", max_length=40)
    time: str = Field(default="", max_length=5)
    meal: str = Field(default="", max_length=80)
    extra_doses: list[MedicationDose] = Field(default_factory=list, max_length=2)
    food_notes: str = Field(default="", max_length=120)
    ok: bool = Field(default=False, strict=True)


class DraftUpdate(Model):
    revision: int = Field(ge=0)
    phase: Literal["photos", "review", "summary"] = "photos"
    index: int = Field(default=0, ge=0, le=4)
    meds: list[Medication] = Field(max_length=5)


class CardCreate(Model):
    draft_id: str
    revision: int = Field(ge=0)
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def validate_cycle(self) -> Self:
        if self.end_date and (not self.start_date or self.end_date < self.start_date):
            raise ValueError("结束日期不能早于开始日期")
        return self


class ReminderCreate(Model):
    card_id: str
    times: list[str] = Field(min_length=1, max_length=15)
    timezone: str = "Asia/Shanghai"

    @field_validator("times")
    @classmethod
    def times_valid(cls, values):
        import re
        if any(not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", v) for v in values):
            raise ValueError("时间须为 HH:MM")
        return values

    @field_validator("timezone")
    @classmethod
    def tz_valid(cls, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("时区无效")
        return value


class ReminderUpdate(Model):
    enabled: bool = Field(strict=True)


class ReportRequest(Model):
    upload_id: str


class ReportVoiceSummary(Model):
    text: str = Field(min_length=1, max_length=250)


class ReportIndicatorLookup(Model):
    name: str = Field(min_length=1, max_length=100)


class LifestyleIndicator(Model):
    name: str = Field(min_length=1, max_length=200)
    status: Literal["review", "high", "low", "outside", "conflict", "within", "unmarked"]
    value: str = Field(default="", max_length=200)
    reference: str = Field(default="", max_length=200)
    unit: str = Field(default="", max_length=200)


class ReportLifestyle(Model):
    indicators: list[LifestyleIndicator] = Field(min_length=1, max_length=200)


class MedicationLogUpdate(Model):
    taken: bool = Field(strict=True)
    day: date
