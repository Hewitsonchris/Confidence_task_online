//
import make_thick_arc from '../utils/arc'
const WHITE = 0xffffff
const LIGHTBLUE = 0x86c5da
const GREEN = 0x09ce0e // actually move to the target
const YELLOW = 0xffff00
const MAGENTA = 0xf666bd
const RED = 0xff0000
const GRAY = 0x666666
const TARGET_SIZE_RADIUS = 20
const TARGET_OUTER_RADIUS = 30

export default class BasicExample extends Phaser.GameObjects.Container {
  // vis cursor + target
  constructor(scene, x, y, has_feedback = true, clamp = false) { // clamp is going to be exaggerated ~5 degrees
    let target = scene.add.circle(0, -100, TARGET_SIZE_RADIUS, GREEN)
    let cur = scene.add.circle(0, 100, 8, LIGHTBLUE, has_feedback)
    let center = scene.add.circle(0, 100, 15, WHITE)

    let scale = scene.add.rectangle(-300, 100, 50, 100, 0xffff00).setOrigin(0.5, 0.5)
    let thumb = scene.add.rectangle(-300, 100, 50, 2, GRAY).setOrigin(0.5, 0.5)

    let confidence_txt1 = scene.add.text(-300, 200, 'Not confident', {
      fontFamily: 'Verdana',
      color: '#ffffff',
      backgroundColor: '#000000',
      fontSize: 20,
      align: 'center'
  }).setOrigin(0.5, 0.5)
    
     let confidence_txt2 = scene.add.text(-300, 0, 'Very confident', {
      fontFamily: 'Verdana',
      color: '#ffffff',
      backgroundColor: '#000000',
      fontSize: 20,
      align: 'center'
  }).setOrigin(0.5, 0.5)

    target.visible = false

    

    let img_cur = scene.add.image(0, 100, 'cursor').setOrigin(0, 0).setScale(0.2)


    let stims = [target, cur, center, img_cur, scale, thumb, confidence_txt1, confidence_txt2] //this ensures that all objects are cleaned after examples plays through. Be sure that adding objects here shifts them by xp/yp, so be sure to adjust in 'let' 
    super(scene, x, y, stims)
    let xp = 0
    let yp = -100

    let rad = Phaser.Math.DegToRad(270-6) // implementing a fake clamp
    let xc = 200*Math.cos(rad)
    let yc = 200*Math.sin(rad) + 100

    scene.add.existing(this)
    this.tl1 = scene.tweens.timeline({
      loop: -1,
      loopDelay: 0,
      paused: true,
      tweens: [
        // start with green target
        {
          targets: target,
          y: -100,
          ease: 'Linear',
          duration: 200,
          onStart: () => {
            center.visible = true
          },
          onComplete: () => {
              center.visible = false
              target.visible = true
          }
        },
        // then move cursor through target
        {
          offset: 600,
          targets: img_cur,
          x: xp,
          y: yp-50,
          ease: 'Power2',
          duration: 300
        },
        // move this cursor through target too
        {
          offset: 600,
          targets: cur,
          x: clamp ? xc : xp,
          y: clamp ? yc : yp,
          ease: 'Power2',
          duration: 300,
            onStart: () => {
                target.fillColor = GREEN
                target.visible = true
                center.visible = false
          },
            onComplete: () => {
                target.fillColor = GREEN
                target.visible = true
                center.visible = false
          }
          },

        //reset the cursor
        {
            offset: 1400,
            targets: img_cur,
            x: 0,
            y: 100,
            ease: 'Power2',
            duration: 100,
            onStart: () => {
                center.visible = true
                target.visible = false
            },
            onComplete: () => {
                center.visible = true
                target.visible = false 
            }
        },
        {
            offset: 1400,
            targets: cur,
            x: 0,
            y: 100,
            ease: 'Power2',
            duration: 100,
            onComplete: () => {
                this.counter = 0
                scale.setFillStyle(GREEN)

            }
        },


          // rate confidence
          {
            offset: 2000,
            targets: scale,
            y: 100,
            ease: 'Linear',
            duration: 500,
            onStart: () => {
              scale.visible = true


            },
            onComplete: () => {
              scale.visible = true

            }
          },

       /*    {
            offset: 2000,
            targets: confidence_txt1,
            y: 400,
            ease: 'Linear',
            duration: 500,
            onStart: () => {

              
            },
            onComplete: () => {

            }
          }, */


          // {
          //   offset: 2000,
          //   targets: confidence_txt2,
          //   y: 200,
          //   ease: 'Linear',
          //   duration: 500,
          //   onStart: () => {
          //     confidence_txt1.visible = true
          //     confidence_txt2.visible = true
          //   },
          //   onComplete: () => {
          //     confidence_txt1.visible = true
          //     confidence_txt2.visible = true
          //   }
          // },
          
          {
            offset: 2000,
            targets: thumb,
            y: 70,
            ease: 'Power2',
            duration: 500,
            onStart: () => {
              thumb.visible = true
            },
            onComplete: () => {
              thumb.visible = true
            }
        },

        {
          offset: 2500,
          targets: thumb,
          y: 100,
          ease: 'linear',
          duration: 0,
          onStart: () => {
            thumb.visible = true

          },
          onComplete: () => {
            thumb.visible = true
            scale.setFillStyle(YELLOW)

          }
        },


        // turn the on other target
        {
          offset: 3000,
          targets: target,
          y: -100,
          ease: 'Linear',
          duration: 200,
            onStart: () => {
            target.fillColor = GREEN
            target.visible = true
            center.visible = false
            
          },
          onComplete: () => {
            target.fillColor == GREEN
            target.visible = true
            center.visible = false
          }
        },
        // move this cursor through target too
        {
          offset: 3000 + 200,
          targets: img_cur,
          x: xp,
          y: yp-50,
          ease: 'Power2',
          duration: 300,
          onStart: () => {
            center.visible = false
          },
          onComplete: () => {
            center.visible = false
          }
          },
          {
              offset: 3000 + 200,
              targets: cur,
              x: clamp ? xc : xp,
              y: clamp ? yc : yp,
              ease: 'Power2',
              duration: 300,
              onStart: () => {
                  center.visible = false
              },
              onComplete: () => {
                  center.visible = false
              }
          },
          //reset the cursor
          {
              offset: 3900,
              targets: img_cur,
              x: 0,
              y: 100,
              ease: 'Power2',
              duration: 100,
              onStart: () => {
                  target.visible = false
                  center.visible = true
              },
              onComplete: () => {
                  target.visible = false
                  center.visible = true
              }
          },
          {
              offset: 3900,
              targets: cur,
              x: 0,
              y: 100,
              ease: 'Power2',
              duration: 100,
              onComplete: () => {
                  target.visible = false
                  center.visible = true
                  scale.setFillStyle(RED)

              }
          },

          // rate confidence again
          {
            offset: 4500,
            targets: scale,
            y: 100,
            ease: 'Linear',
            duration: 500,
            onStart: () => {
              scale.visible = true


            },
            onComplete: () => {
              scale.visible = true

            }
          },

        //   {
        //     offset: 4500,
        //     targets: confidence_txt1,
        //     y: 400,
        //     ease: 'Linear',
        //     duration: 500,
        //     onStart: () => {

        //     },
        //     onComplete: () => {

        //     }
        //   },

        //   {
        //     offset: 4500,
        //     targets: confidence_txt2,
        //     y: 200,
        //     ease: 'Linear',
        //     duration: 500,
        //     onStart: () => {

        //     },
        //     onComplete: () => {
        //  }
        //   },
          
          
          {
            offset: 4500,
            targets: thumb,
            y: 130,
            ease: 'Power2',
            duration: 500,
            onStart: () => {
              thumb.visible = true

            },
            onComplete: () => {
              thumb.visible = true

            }
        },

        {
          offset: 5000,
          targets: thumb,
          y: 100,
          ease: 'linear',
          duration: 0,
          onStart: () => {
            thumb.visible = true
          },
          onComplete: () => {
            thumb.visible = true
            scale.setFillStyle(YELLOW)

          }
        },
       
              ]
            })
          }

  play() {
    this.tl1.play()
    this.tl1.resume()
  }
  stop() {
    this.tl1.pause()
  }
}
