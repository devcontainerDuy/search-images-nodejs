import turtle
import math

def draw_heart_2d():
    turtle.clear()
    turtle.penup()
    turtle.goto(0, -150)
    turtle.pendown()
    turtle.color('red')
    turtle.begin_fill()
    turtle.left(140)
    turtle.forward(180)
    turtle.circle(-90, 180)
    turtle.setheading(60)
    turtle.circle(-90, 180)
    turtle.forward(180)
    turtle.end_fill()
    turtle.penup()
    turtle.goto(0, -180)
    turtle.pendown()
    turtle.color('black')
    turtle.done()

def draw_heart_3d():
    window = turtle.Screen()
    window.clear()
    window.tracer(0)
    my_turtle = turtle.Turtle()
    my_turtle.penup()
    my_turtle.goto(0, 0)
    my_turtle.pendown()
    my_turtle.color('red')
    my_turtle.begin_fill()
    for _ in range(36):
        my_turtle.forward(100)
        my_turtle.right(10)
    my_turtle.end_fill()
    window.mainloop()

if __name__ == '__main__':
    draw_heart_2d()
    draw_heart_3d()
