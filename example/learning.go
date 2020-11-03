// Learning Go

package main

import (
	"fmt"
)

type subject struct {
	id   int
	name string
}

func main() {
	subj := subject{1, "world"}
	fmt.Printf("hello %s #", subj.name)
}
