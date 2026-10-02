package main

import "time"

func nullableID(id int64) any {
	if id == 0 {
		return nil
	}
	return id
}

func pgYear() int { return time.Now().Year() }
