package api

import (
	"math/big"
	"testing"

	"github.com/jackc/pgtype"
)

func TestNumericToFloat64(t *testing.T) {
	// 599.00 -> Int=59900 Exp=-2
	n := pgtype.Numeric{Int: big.NewInt(59900), Exp: -2, Status: pgtype.Present}
	got, ok := numericToFloat64(n).(float64)
	if !ok {
		t.Fatalf("期望 float64")
	}
	if got < 598.99 || got > 599.01 {
		t.Fatalf("599.00 转换错误，得到 %v", got)
	}

	// NULL 数值
	null := pgtype.Numeric{Status: pgtype.Null}
	if numericToFloat64(null) != nil {
		t.Fatalf("NULL 应转为 nil")
	}
}

func TestRoundF(t *testing.T) {
	if roundF(12.0166, 2) != 12.02 {
		t.Fatalf("roundF 错误，得到 %v", roundF(12.0166, 2))
	}
}

func TestMaxF(t *testing.T) {
	if maxF(3, 5) != 5 || maxF(7, 2) != 7 {
		t.Fatalf("maxF 错误")
	}
}
